/**
 * PROTOCOL TRACE V2 — after price-format fix.
 * HATCH MAG7 path first; if terminal non-fill due to empty asks, continue on a liquid book
 * until FILLED (or document hard protocol limitation).
 */
import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync, mkdirSync } from "node:fs";
import { keccak256, stringToBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  formatDecimal,
  formatPrice,
  type SpotSymbolMeta,
} from "../src/services/sodexSymbols.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../../../.env") });

const SPOT = "https://testnet-gw.sodex.dev/api/v1/spot";
const CHAIN_ID = 138565;
const ACCOUNT_ID = Number(process.env.SODEX_ACCOUNT_ID);
const ADDR = String(process.env.SODEX_ADDRESS).replace(/"/g, "").toLowerCase();
const PK = (process.env.SODEX_PRIVATE_KEY!.startsWith("0x")
  ? process.env.SODEX_PRIVATE_KEY!
  : `0x${process.env.SODEX_PRIVATE_KEY!}`) as Hex;

type Step = {
  n: number | string;
  name: string;
  timestamp: string;
  latencyMs?: number;
  status: "ok" | "fail" | "info";
  http?: { method: string; url: string; headers?: Record<string, string>; body?: unknown };
  response?: { status?: number; headers?: Record<string, string>; json?: unknown; text?: string };
  note?: string;
  stop?: boolean;
};

const steps: Step[] = [];

function ts() {
  return new Date().toISOString();
}

function log(step: Step) {
  steps.push(step);
  console.log(`[${step.n}] ${step.status.toUpperCase()} ${step.name} (${step.latencyMs ?? 0}ms)`);
  if (step.stop) console.log("STOP:", step.note);
}

async function httpJson(
  method: string,
  url: string,
  opts?: { headers?: Record<string, string>; body?: unknown },
): Promise<{ status: number; json: unknown; text: string; latencyMs: number; resHeaders: Record<string, string> }> {
  const started = Date.now();
  const res = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      ...(opts?.body ? { "content-type": "application/json" } : {}),
      ...(opts?.headers || {}),
    },
    body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text);
  } catch {
    /* keep text */
  }
  const resHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    resHeaders[k] = v;
  });
  return { status: res.status, json, text, latencyMs: Date.now() - started, resHeaders };
}

function normalizeEcdsaV(signature: Hex): Hex {
  const raw = signature.startsWith("0x") ? signature.slice(2) : signature;
  if (raw.length !== 130) return signature;
  let v = Number.parseInt(raw.slice(128, 130), 16);
  if (v >= 27) v -= 27;
  return `0x${raw.slice(0, 128)}${v.toString(16).padStart(2, "0")}` as Hex;
}

function metaFromRow(row: any): SpotSymbolMeta {
  const pricePrecision = Number(row.pricePrecision ?? 4);
  const tick = Number(row.tickSize);
  return {
    id: Number(row.id),
    name: String(row.name),
    baseCoin: String(row.baseCoin ?? ""),
    minNotional: Number(row.minNotional ?? 5),
    minQuantity: Number(row.minQuantity ?? 0.01),
    stepSize: Number(row.stepSize ?? 0.01),
    quantityPrecision: Number(row.quantityPrecision ?? 2),
    pricePrecision,
    tickSize: tick > 0 ? tick : Math.pow(10, -pricePrecision),
    status: String(row.status ?? "UNKNOWN"),
  };
}

function dump(extra?: Record<string, unknown>) {
  const out = {
    generatedAt: new Date().toISOString(),
    wallet: ADDR,
    accountID: ACCOUNT_ID,
    chainId: CHAIN_ID,
    gateway: SPOT,
    steps,
    ...extra,
  };
  const path = resolve(__dirname, "../../../artifacts/protocol_trace_v2_raw.json");
  mkdirSync(resolve(__dirname, "../../../artifacts"), { recursive: true });
  writeFileSync(path, JSON.stringify(out, null, 2));
  console.log("Wrote", path);
}

async function placeAndTrace(opts: {
  label: string;
  symbolName: string;
  meta: SpotSymbolMeta;
  notionalUsd: number;
  /** mid for hatch-style; or reference for slip */
  referencePrice: number;
  useSlip005: boolean;
  book: { bids: any[]; asks: any[] };
}) {
  const { label, symbolName, meta, notionalUsd, referencePrice, useSlip005, book } = opts;
  const bestBid = book.bids?.[0] ?? null;
  const bestAsk = book.asks?.[0] ?? null;
  const spread =
    bestBid && bestAsk ? Number(bestAsk[0]) - Number(bestBid[0]) : null;

  log({
    n: `${label}.liquidity`,
    name: `liquidity_${symbolName}`,
    timestamp: ts(),
    status: "info",
    response: {
      json: {
        bestBid,
        bestAsk,
        bidDepthLevels: book.bids?.length ?? 0,
        askDepthLevels: book.asks?.length ?? 0,
        spread,
        minNotional: meta.minNotional,
        tickSize: meta.tickSize,
        pricePrecision: meta.pricePrecision,
        quantityPrecision: meta.quantityPrecision,
        stepSize: meta.stepSize,
        orderType: "LIMIT=1",
        timeInForce: "IOC=3",
        useSlip005,
      },
    },
  });

  const pxNum = useSlip005 ? referencePrice * 1.005 : referencePrice;
  const price = formatPrice(pxNum, meta);
  const step = meta.stepSize > 0 ? meta.stepSize : 0.01;
  const rawQty = Math.max(notionalUsd / referencePrice, meta.minNotional / referencePrice);
  const stepped = Math.ceil(rawQty / step - 1e-12) * step;
  const quantity = formatDecimal(stepped, step, "round");
  const clOrdID = `hv2${label}${Date.now().toString(36)}`.slice(0, 36);

  const params = {
    accountID: ACCOUNT_ID,
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
  };
  const actionType = "batchNewOrder";
  const envelope = { type: actionType, params };
  const payloadHash = keccak256(stringToBytes(JSON.stringify(envelope)));
  const nonce = BigInt(Date.now());

  log({
    n: `${label}.1`,
    name: "unsigned_payload",
    timestamp: ts(),
    status: "info",
    http: {
      method: "N/A",
      url: "local EIP-712",
      body: {
        envelope,
        payloadHash,
        nonce: nonce.toString(),
        domain: {
          name: "spot",
          version: "1",
          chainId: CHAIN_ID,
          verifyingContract: "0x0000000000000000000000000000000000000000",
        },
      },
    },
  });

  const account = privateKeyToAccount(PK);
  const typedData = {
    domain: {
      name: "spot" as const,
      version: "1" as const,
      chainId: CHAIN_ID,
      verifyingContract: "0x0000000000000000000000000000000000000000" as const,
    },
    types: {
      ExchangeAction: [
        { name: "payloadHash", type: "bytes32" },
        { name: "nonce", type: "uint64" },
      ],
    },
    primaryType: "ExchangeAction" as const,
    message: { payloadHash, nonce },
  };

  log({
    n: `${label}.2`,
    name: "typed_data",
    timestamp: ts(),
    status: "info",
    response: { json: { ...typedData, message: { payloadHash, nonce: nonce.toString() } } },
  });

  const tSig = Date.now();
  const rawSig = await account.signTypedData(typedData);
  const apiSign = `0x01${normalizeEcdsaV(rawSig).slice(2)}`;
  log({
    n: `${label}.3`,
    name: "signature",
    timestamp: ts(),
    latencyMs: Date.now() - tSig,
    status: "ok",
    response: { json: { rawSig, apiSign, signer: account.address } },
  });

  const hatchHeaders = {
    accept: "application/json",
    "content-type": "application/json",
    "X-API-Sign": apiSign,
    "X-API-Nonce": nonce.toString(),
  };
  const relayUrl = `${SPOT}/trade/orders/batch`;
  log({
    n: `${label}.4`,
    name: "relay_request",
    timestamp: ts(),
    status: "info",
    http: {
      method: "POST",
      url: relayUrl,
      headers: { ...hatchHeaders, "X-API-Sign": `${apiSign.slice(0, 18)}…` },
      body: params,
    },
    note: "HATCH relay headers (no X-API-Chain) — proven non-causal for accepts",
  });

  const relay = await httpJson("POST", relayUrl, { headers: hatchHeaders, body: params });
  const relayJson = relay.json as any;
  log({
    n: `${label}.5`,
    name: "relay_response",
    timestamp: ts(),
    latencyMs: relay.latencyMs,
    status: relay.status >= 200 && relay.status < 300 ? "ok" : "fail",
    response: { status: relay.status, headers: relay.resHeaders, json: relayJson, text: relay.text },
    stop: relay.status >= 300,
  });
  if (relay.status >= 300) return { ok: false as const, reason: "http", clOrdID };

  log({
    n: `${label}.6`,
    name: "exchange_response",
    timestamp: ts(),
    status: relayJson?.code === 0 ? "ok" : "fail",
    response: { json: relayJson },
    stop: relayJson?.code !== 0,
    note: relayJson?.code !== 0 ? `code=${relayJson?.code} error=${relayJson?.error}` : undefined,
  });
  if (relayJson?.code !== 0) return { ok: false as const, reason: "exchange", clOrdID, relayJson };

  const leg = Array.isArray(relayJson.data) ? relayJson.data[0] : null;
  log({
    n: `${label}.7`,
    name: "order_id",
    timestamp: ts(),
    status: leg?.orderID != null ? "ok" : "fail",
    response: { json: { orderID: leg?.orderID, leg } },
    stop: leg?.orderID == null,
  });
  if (leg?.orderID == null) return { ok: false as const, reason: "no_order_id", clOrdID };

  log({
    n: `${label}.8`,
    name: "client_order_id",
    timestamp: ts(),
    status: "ok",
    response: { json: { clOrdID: leg.clOrdID || clOrdID, sent: clOrdID } },
  });

  const orderID = leg.orderID;
  let finalHist: any = null;
  const terminal = new Set(["FILLED", "CANCELED", "CANCELLED", "EXPIRED", "REJECTED", "PARTIALLY_FILLED"]);

  for (let i = 0; i < 15; i++) {
    const hist = await httpJson("GET", `${SPOT}/accounts/${ADDR}/orders/history?limit=50`);
    const rows = Array.isArray((hist.json as any)?.data) ? (hist.json as any).data : [];
    const matched = rows.find(
      (r: any) => String(r.orderID) === String(orderID) || String(r.clOrdID) === String(clOrdID),
    );
    log({
      n: `${label}.9.poll${i}`,
      name: "orders_history_poll",
      timestamp: ts(),
      latencyMs: hist.latencyMs,
      status: matched ? "ok" : "info",
      http: { method: "GET", url: `${SPOT}/accounts/${ADDR}/orders/history?limit=50` },
      response: { status: hist.status, json: matched || { matched: false, recent3: rows.slice(0, 3) } },
      note: matched
        ? `status=${matched.status} executedQty=${matched.executedQty} remainingQty=${matched.remainingQty ?? matched.leavesQty}`
        : "not in history yet",
    });
    if (matched) {
      finalHist = matched;
      if (terminal.has(String(matched.status))) break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!finalHist) {
    log({
      n: `${label}.9.missing`,
      name: "orders_history_missing",
      timestamp: ts(),
      status: "fail",
      note: `orderID=${orderID} clOrdID=${clOrdID} never appeared in history`,
      stop: true,
    });
    return { ok: false as const, reason: "missing_history", orderID, clOrdID };
  }

  const trades = await httpJson(
    "GET",
    `${SPOT}/accounts/${ADDR}/trades?orderID=${orderID}&limit=50`,
  );
  const tradeRows = Array.isArray((trades.json as any)?.data) ? (trades.json as any).data : [];
  const tradesForOrder = tradeRows.filter((t: any) => String(t.orderID) === String(orderID));
  log({
    n: `${label}.10`,
    name: "trades",
    timestamp: ts(),
    latencyMs: trades.latencyMs,
    status: "ok",
    http: { method: "GET", url: `${SPOT}/accounts/${ADDR}/trades?orderID=${orderID}&limit=50` },
    response: {
      status: trades.status,
      json: { tradesForOrder, rawLen: tradeRows.length, rawSample: tradeRows.slice(0, 3) },
    },
  });

  const status = String(finalHist.status);
  const executedQty = Number(finalHist.executedQty ?? 0);
  if (["CANCELED", "CANCELLED", "EXPIRED", "REJECTED", "PARTIALLY_FILLED"].includes(status)) {
    log({
      n: `${label}.terminal_nonfill`,
      name: "terminal_nonfill_details",
      timestamp: ts(),
      status: status === "PARTIALLY_FILLED" && executedQty > 0 ? "info" : "info",
      response: {
        json: {
          status,
          remainingQty: finalHist.remainingQty ?? finalHist.leavesQty ?? null,
          executedQty: finalHist.executedQty,
          avgPrice: finalHist.avgPrice ?? finalHist.price,
          reason: finalHist.reason ?? finalHist.cancelReason ?? null,
          tradeIds: tradesForOrder.map((t: any) => t.tradeID),
          asksEmpty: (book.asks?.length ?? 0) === 0,
          iocCannotFillWithoutAsks:
            (book.asks?.length ?? 0) === 0
              ? "BUY IOC requires resting asks to match against; empty ask book → cancel/expire with executedQty=0"
              : null,
        },
      },
    });
  }

  return {
    ok: true as const,
    orderID,
    clOrdID,
    finalHist,
    tradesForOrder,
    filled: status === "FILLED" || (status === "PARTIALLY_FILLED" && executedQty > 0),
    status,
    price,
    quantity,
    symbolName,
  };
}

async function main() {
  log({
    n: 0,
    name: "trace_meta_v2",
    timestamp: ts(),
    status: "info",
    note: `wallet=${ADDR} accountID=${ACCOUNT_ID} priceFormat=formatPrice(stripZeros)`,
  });

  const symRes = await httpJson("GET", `${SPOT}/markets/symbols`);
  const symbols = ((symRes.json as any)?.data || []).map(metaFromRow) as SpotSymbolMeta[];
  const mag7 = symbols.find((s) => s.name === "vMAG7ssi_vUSDC");
  const wsoso = symbols.find((s) => s.name === "WSOSO_vUSDC");
  if (!mag7 || !wsoso) {
    log({ n: 0, name: "symbols", timestamp: ts(), status: "fail", note: "missing MAG7 or WSOSO", stop: true });
    dump();
    return;
  }

  // Balances / state BEFORE (shared)
  const balBefore = await httpJson("GET", `${SPOT}/accounts/${ADDR}/balances`);
  log({
    n: 11,
    name: "balances_BEFORE",
    timestamp: ts(),
    latencyMs: balBefore.latencyMs,
    status: "ok",
    http: { method: "GET", url: `${SPOT}/accounts/${ADDR}/balances` },
    response: { status: balBefore.status, json: balBefore.json },
  });
  const stateBefore = await httpJson("GET", `${SPOT}/accounts/${ADDR}/state`);
  log({
    n: 13,
    name: "account_state_BEFORE",
    timestamp: ts(),
    latencyMs: stateBefore.latencyMs,
    status: "ok",
    http: { method: "GET", url: `${SPOT}/accounts/${ADDR}/state` },
    response: { status: stateBefore.status, json: stateBefore.json },
  });

  // ── Attempt A: HATCH MAG7 Path ──────────────────────────
  const bookMag = await httpJson("GET", `${SPOT}/markets/vMAG7ssi_vUSDC/orderbook?limit=20`);
  log({
    n: 15,
    name: "orderbook_BEFORE_MAG7",
    timestamp: ts(),
    latencyMs: bookMag.latencyMs,
    status: "ok",
    http: { method: "GET", url: `${SPOT}/markets/vMAG7ssi_vUSDC/orderbook?limit=20` },
    response: { status: bookMag.status, json: bookMag.json },
  });
  const magBook = (bookMag.json as any)?.data || { bids: [], asks: [] };
  const tickers = await httpJson("GET", `${SPOT}/markets/tickers`);
  const magT = ((tickers.json as any)?.data || []).find((t: any) => t.symbol === "vMAG7ssi_vUSDC");
  const magMid = Number(magT?.lastPx || magT?.bidPx || 0);

  const attemptA = await placeAndTrace({
    label: "A_MAG7",
    symbolName: "vMAG7ssi_vUSDC",
    meta: mag7,
    notionalUsd: 6,
    referencePrice: magMid,
    useSlip005: false,
    book: magBook,
  });

  if (!attemptA.ok && (attemptA as any).reason === "exchange") {
    dump({ outcome: "STOP_exchange_reject", attemptA });
    return;
  }

  const bookMagAfter = await httpJson("GET", `${SPOT}/markets/vMAG7ssi_vUSDC/orderbook?limit=20`);
  log({
    n: 16,
    name: "orderbook_AFTER_MAG7",
    timestamp: ts(),
    latencyMs: bookMagAfter.latencyMs,
    status: "ok",
    response: { status: bookMagAfter.status, json: bookMagAfter.json },
  });

  let fillResult = attemptA.ok && attemptA.filled ? attemptA : null;

  // If MAG7 did not fill — continue automatically to liquid market (protocol fill proof)
  if (!fillResult) {
    const asksEmpty = (magBook.asks?.length ?? 0) === 0;
    log({
      n: "A.continue",
      name: "MAG7_nonfill_continue",
      timestamp: ts(),
      status: "info",
      note: asksEmpty
        ? "MAG7 asks empty → BUY IOC cannot match. GTC would rest on bid side without filling until a seller appears. Continuing on liquid WSOSO to prove FILLED path with identical signing/relay."
        : "MAG7 accepted but not FILLED; continuing on liquid WSOSO for fill proof.",
    });

    const bookW = await httpJson("GET", `${SPOT}/markets/WSOSO_vUSDC/orderbook?limit=20`);
    log({
      n: "B.15",
      name: "orderbook_BEFORE_WSOSO",
      timestamp: ts(),
      latencyMs: bookW.latencyMs,
      status: "ok",
      response: { status: bookW.status, json: bookW.json },
    });
    const wBook = (bookW.json as any)?.data || { bids: [], asks: [] };
    const wT = ((tickers.json as any)?.data || []).find((t: any) => t.symbol === "WSOSO_vUSDC");
    const wRef = Number(wBook.asks?.[0]?.[0] || wT?.askPx || wT?.lastPx || wT?.bidPx || 0);

    if ((wBook.asks?.length ?? 0) === 0 && !(wRef > 0)) {
      log({
        n: "B.stop",
        name: "no_liquid_asks",
        timestamp: ts(),
        status: "fail",
        note: "No liquid ask book found on WSOSO either — cannot prove FILLED without counterparties",
        stop: true,
      });
      dump({ outcome: "B_no_liquidity" });
      return;
    }

    const attemptB = await placeAndTrace({
      label: "B_WSOSO",
      symbolName: "WSOSO_vUSDC",
      meta: wsoso,
      notionalUsd: 6,
      referencePrice: wRef > 0 ? wRef : magMid,
      useSlip005: true, // sosomind market-style buffer for fill proof
      book: wBook,
    });

    if (!attemptB.ok && (attemptB as any).reason === "exchange") {
      dump({ outcome: "STOP_exchange_reject_B", attemptB });
      return;
    }

    const bookWAfter = await httpJson("GET", `${SPOT}/markets/WSOSO_vUSDC/orderbook?limit=20`);
    log({
      n: "B.16",
      name: "orderbook_AFTER_WSOSO",
      timestamp: ts(),
      latencyMs: bookWAfter.latencyMs,
      status: "ok",
      response: { status: bookWAfter.status, json: bookWAfter.json },
    });

    if (attemptB.ok && attemptB.filled) fillResult = attemptB;
  }

  const balAfter = await httpJson("GET", `${SPOT}/accounts/${ADDR}/balances`);
  log({
    n: 12,
    name: "balances_AFTER",
    timestamp: ts(),
    latencyMs: balAfter.latencyMs,
    status: "ok",
    http: { method: "GET", url: `${SPOT}/accounts/${ADDR}/balances` },
    response: { status: balAfter.status, json: balAfter.json },
  });
  const stateAfter = await httpJson("GET", `${SPOT}/accounts/${ADDR}/state`);
  log({
    n: 14,
    name: "account_state_AFTER",
    timestamp: ts(),
    latencyMs: stateAfter.latencyMs,
    status: "ok",
    response: { status: stateAfter.status, json: stateAfter.json },
  });

  const beforeCoins = new Map(
    (((balBefore.json as any)?.data?.balances || []) as any[]).map((b) => [b.coin, b.total]),
  );
  const afterCoins = (((balAfter.json as any)?.data?.balances || []) as any[]).map((b) => ({
    coin: b.coin,
    before: beforeCoins.get(b.coin) ?? "0",
    after: b.total,
    delta: Number(b.total) - Number(beforeCoins.get(b.coin) ?? 0),
  }));

  log({
    n: 17,
    name: "explorer_records",
    timestamp: ts(),
    status: "info",
    note: "SoDEX CLOB fills are not EVM txs. Proof = REST history/trades/balances.",
    response: {
      json: {
        sodexPortfolio: "https://testnet.sodex.com/portfolio",
        orderID: fillResult && "orderID" in fillResult ? fillResult.orderID : null,
      },
    },
  });

  log({
    n: 18,
    name: "database_rows",
    timestamp: ts(),
    status: "info",
    note: "Direct gateway capture — no HATCH Prisma row. Production path writes signed_orders on /api/sodex/relay.",
  });

  log({
    n: 20,
    name: "final_portfolio_delta",
    timestamp: ts(),
    status: fillResult?.filled ? "ok" : "fail",
    response: { json: { deltas: afterCoins.filter((d) => Math.abs(d.delta) > 1e-12), fillResult } },
  });

  const outcome = fillResult?.filled
    ? "A_FILLED_balances_updated"
    : "B_protocol_or_liquidity_limitation";

  log({
    n: 19,
    name: "timeline_conclusion",
    timestamp: ts(),
    status: fillResult?.filled ? "ok" : "fail",
    note: fillResult?.filled
      ? `FILLED on ${fillResult.symbolName} orderID=${fillResult.orderID}`
      : "No FILLED achieved — see MAG7 empty-ask limitation and WSOSO attempt",
    response: { json: { outcome, fillResult } },
  });

  dump({ outcome, fillResult, balanceDeltas: afterCoins.filter((d) => Math.abs(d.delta) > 1e-12) });
}

main().catch((e) => {
  console.error(e);
  log({ n: 99, name: "uncaught", timestamp: ts(), status: "fail", note: String(e), stop: true });
  dump();
  process.exit(1);
});
