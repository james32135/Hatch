/**
 * Post-fix validation: signed LIMIT IOC on matcher-capable vs cancel-only symbols.
 * Usage: npx tsx scripts/validate-capability-fix.mts
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { SODEX } from "../src/config/addresses.js";
import { resolveProfile } from "../src/config/environment.js";
import { createSodexClient } from "../src/clients/sodex.js";
import {
  getSymbolCapability,
  isCancelOnlyError,
  recordCancelOnly,
  recordMatcherAccepted,
  reloadCapabilitiesFromProbe,
} from "../src/services/marketCapability.js";
import {
  liveCapabilityProbe,
  parseMetaRow,
  unwrapSymbolList,
} from "../src/services/marketEligibility.js";
import { engSignExchangeAction } from "../src/services/engSodexSigner.js";
import {
  SPOT_ACTION_BATCH_NEW,
  SPOT_TRADE_BATCH_PATH,
  buildBatchNewOrdersParams,
} from "../src/services/spotOrders.js";
import { formatDecimal, formatPrice } from "../src/services/sodexSymbols.js";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env") });

function clOrd(): string {
  return `vf${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

async function signAndSubmit(body: unknown, tradeAmountUsd: number) {
  const signed = await engSignExchangeAction({
    scope: "spot",
    chainId: SODEX.testnet.chainId,
    actionType: SPOT_ACTION_BATCH_NEW,
    params: body,
    nonce: BigInt(Date.now()),
    network: "testnet",
    tradeAmountUsd,
  });
  const client = createSodexClient(resolveProfile("testnet"));
  return client.relay("POST", SPOT_TRADE_BATCH_PATH, body, {
    apiSign: signed.apiSign,
    apiNonce: signed.nonce,
  });
}

async function balances(wallet: string) {
  return createSodexClient(resolveProfile("testnet")).accountBalances(wallet);
}

function usdcFree(bal: unknown): string {
  const root = bal && typeof bal === "object" ? (bal as Record<string, unknown>) : {};
  const data = (root.data ?? bal) as unknown;
  const rows = Array.isArray(data)
    ? data
    : Array.isArray((data as { balances?: unknown })?.balances)
      ? ((data as { balances: unknown[] }).balances as unknown[])
      : [];
  for (const row of rows) {
    const r = row as Record<string, unknown>;
    const coin = String(r.coin ?? r.asset ?? r.currency ?? "");
    if (/usdc/i.test(coin)) return String(r.available ?? r.free ?? r.balance ?? "0");
  }
  return "n/a";
}

async function validateSymbol(symbol: string, expectCancelOnly: boolean) {
  const profile = resolveProfile("testnet");
  const client = createSodexClient(profile);
  const address = process.env.SODEX_ADDRESS!.replace(/^"|"$/g, "").toLowerCase();
  const accountID = Number(process.env.SODEX_ACCOUNT_ID);
  const elig = await liveCapabilityProbe({
    profile,
    symbol,
    notionalUsd: 6,
    accountID,
  });
  console.log(`[pre] ${symbol}`, {
    executable: elig.eligible,
    cancelOnly: elig.cancelOnly,
    capability: elig.gatewayValidation,
    matcherCapable: elig.matcherCapable,
    failReason: elig.failReason,
  });

  if (expectCancelOnly) {
    if (elig.eligible || elig.matcherCapable) {
      throw new Error(`${symbol} still shown executable despite cancel-only evidence`);
    }
  } else if (!elig.matcherCapable) {
    throw new Error(`${symbol} not matcher-capable before signed validation`);
  } else if (!elig.eligible) {
    throw new Error(
      `${symbol} matcher-capable but not eligible: ${elig.failReason} (${elig.dry.error || "dry ok"})`,
    );
  }

  const symRaw = await client.marketsSymbols();
  const meta = unwrapSymbolList(symRaw)
    .map(parseMetaRow)
    .find((m) => m && m.name === symbol);
  if (!meta) throw new Error(`meta missing ${symbol}`);
  const bookRaw = await client.orderbook(symbol, 5);
  const book =
    bookRaw && typeof bookRaw === "object" && "data" in (bookRaw as object)
      ? ((bookRaw as { data: Record<string, unknown> }).data as Record<string, unknown>)
      : (bookRaw as Record<string, unknown>);
  const asks = Array.isArray(book.asks) ? (book.asks as [string, string][]) : [];
  const bestAsk = asks[0] ? Number(asks[0][0]) : NaN;
  if (!Number.isFinite(bestAsk) || bestAsk <= 0) {
    throw new Error(`${symbol} empty ask book`);
  }
  const price = formatPrice(bestAsk * 1.005, meta);
  const qtyRaw = Math.max(6 / bestAsk, meta.minNotional / bestAsk, meta.minQuantity);
  const quantity = formatDecimal(
    Math.ceil(qtyRaw / meta.stepSize - 1e-12) * meta.stepSize,
    meta.stepSize,
    "round",
  );
  const clOrdID = clOrd();
  const body = buildBatchNewOrdersParams({
    accountID,
    orders: [
      {
        symbolID: meta.id,
        clOrdID,
        side: 1,
        type: 1,
        timeInForce: 3,
        price,
        quantity,
      },
    ],
  });
  const before = usdcFree(await balances(address));
  const result = await signAndSubmit(body, 6);
  const data = result.data as Record<string, unknown>;
  const err =
    (typeof data?.error === "string" && data.error) ||
    (typeof data?.msg === "string" && data.msg) ||
    (typeof data?.message === "string" && data.message) ||
    null;
  const topCode = data?.code != null ? Number(data.code) : null;
  const leg = Array.isArray(data?.data) ? (data.data[0] as Record<string, unknown>) : null;
  const orderID = leg?.orderID != null ? Number(leg.orderID) : null;
  const cancelOnly = isCancelOnlyError(err);

  if (cancelOnly) {
    await recordCancelOnly({
      network: "testnet",
      symbol,
      marketId: meta.id,
      reason: String(err),
      source: "relay",
    });
  } else if (topCode === 0 && orderID) {
    await recordMatcherAccepted({
      network: "testnet",
      symbol,
      marketId: meta.id,
      orderID,
      source: "relay",
    });
  }

  let matchedOrder: Record<string, unknown> | null = null;
  let matchedTrades: Record<string, unknown>[] = [];
  let after = before;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((r) => setTimeout(r, attempt === 0 ? 800 : 1200));
    const hist = await client.orderHistory(address, { symbol, limit: 50 });
    const trades = await client.userTrades(address, {
      symbol,
      orderID: orderID ?? undefined,
      limit: 50,
    });
    after = usdcFree(await balances(address));
    const histRows = unwrapSymbolList(hist);
    const tradeRows = unwrapSymbolList(trades);
    matchedOrder =
      histRows.find(
        (r) =>
          String(r.clOrdID ?? r.c ?? "") === clOrdID ||
          (orderID && Number(r.orderID ?? r.i) === orderID),
      ) ?? null;
    matchedTrades = tradeRows.filter(
      (r) =>
        (orderID && Number(r.orderID ?? r.i) === orderID) ||
        String(r.clOrdID ?? "") === clOrdID,
    );
    if (matchedOrder) break;
  }

  if (matchedTrades.length > 0 && orderID) {
    await recordMatcherAccepted({
      network: "testnet",
      symbol,
      marketId: meta.id,
      orderID,
      tradeIDs: matchedTrades.map((t) => String(t.tradeID ?? t.i ?? "")),
      fillProven: after !== before,
      source: "relay",
    });
  }

  const summary = {
    symbol,
    expectCancelOnly,
    http: result.status,
    topCode,
    err,
    cancelOnly,
    orderID,
    clOrdID,
    price,
    quantity,
    orderFound: !!matchedOrder,
    orderStatus: matchedOrder
      ? String(matchedOrder.status ?? matchedOrder.X ?? "")
      : null,
    tradeCount: matchedTrades.length,
    tradeIDs: matchedTrades.map((t) => String(t.tradeID ?? t.i ?? "")),
    balanceBefore: before,
    balanceAfter: after,
    postCap: await getSymbolCapability({ network: "testnet", symbol }),
  };
  console.log(`[post] ${symbol}`, JSON.stringify(summary, null, 2));

  if (expectCancelOnly) {
    if (!cancelOnly) throw new Error(`${symbol} expected cancel-only rejection`);
    const post = await liveCapabilityProbe({ profile, symbol, notionalUsd: 6, accountID });
    if (post.eligible || post.matcherCapable || !post.cancelOnly) {
      throw new Error(`${symbol} capability not invalidated after cancel-only`);
    }
  } else {
    if (cancelOnly || topCode !== 0 || !orderID) {
      throw new Error(`${symbol} expected matcher accept, got ${err || topCode}`);
    }
    if (!matchedOrder) {
      // Gateway returned orderID — treat as matcher accepted even if history lagging
      console.warn(
        `${symbol} history lag after orderID=${orderID}; accepting gateway+orderID evidence`,
      );
    }
  }
  return summary;
}

async function main() {
  if (!process.env.SODEX_PRIVATE_KEY || !process.env.SODEX_ADDRESS) {
    throw new Error("SODEX_PRIVATE_KEY / SODEX_ADDRESS required");
  }
  const seeded = await reloadCapabilitiesFromProbe("testnet");
  console.log(`seeded=${seeded}`);

  const cancelOnlyResult = await validateSymbol("vNVDA_vUSDC", true);
  const okResult = await validateSymbol("vBTC_vUSDC", false);

  console.log(
    JSON.stringify(
      {
        ok: true,
        seeded,
        cancelOnly: cancelOnlyResult.symbol,
        matcherOk: okResult.symbol,
        btcOrderID: okResult.orderID,
        btcTrades: okResult.tradeIDs,
        btcBalance: {
          before: okResult.balanceBefore,
          after: okResult.balanceAfter,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
