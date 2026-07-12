/**
 * Engineering-only SoDEX testnet capability probe.
 *
 * This is intentionally separate from application routing. It compares public
 * metadata with real signed gateway/matcher outcomes for every spot symbol.
 *
 * Read-only:
 *   npx tsx scripts/probe-sodex-market-capabilities.mts
 *
 * Real testnet writes ($5/$10 LIMIT IOC, MARKET IOC, LIMIT GTC + cancel):
 *   npx tsx scripts/probe-sodex-market-capabilities.mts --execute
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveProfile } from "../src/config/environment.js";
import {
  engSignExchangeAction,
  engSodexAccountId,
  engSodexAddress,
} from "../src/services/engSodexSigner.js";
import {
  SPOT_ACTION_BATCH_CANCEL,
  SPOT_ACTION_BATCH_NEW,
  SPOT_TRADE_BATCH_PATH,
  buildBatchCancelParams,
} from "../src/services/spotOrders.js";

type Json = Record<string, unknown>;

type SymbolMeta = {
  id: number;
  name: string;
  displayName: string;
  baseCoin: string;
  quoteCoin: string;
  pricePrecision: number;
  tickSize: string;
  minPrice: string;
  maxPrice: string;
  quantityPrecision: number;
  stepSize: string;
  minQuantity: string;
  maxQuantity: string;
  marketMinQuantity: string;
  marketMaxQuantity: string;
  minNotional: string;
  maxNotional: string;
  status: string;
};

type LegacySymbol = {
  id: number;
  symbol: string;
  name: string;
  tradeSwitch: boolean;
  supportOrderType: string;
  supportTimeInForce: string;
};

type ProbeCase = {
  kind: "LIMIT_IOC" | "MARKET_IOC" | "LIMIT_GTC";
  notionalUsd: 5 | 10;
};

type ProbeOutcome = {
  case: ProbeCase;
  clOrdID: string;
  request: Json;
  gatewayHttpStatus: number | null;
  gatewayCode: number | null;
  gatewayError: string | null;
  gatewayAccepted: boolean;
  orderID: number | null;
  matcherAccepted: boolean;
  terminalStatus: string | null;
  executedQty: string | null;
  tradeIDs: number[];
  balanceBefore: string | null;
  balanceAfter: string | null;
  balanceIncreased: boolean | null;
  cancel: {
    attempted: boolean;
    accepted: boolean;
    code: number | null;
    error: string | null;
  };
  reason: string | null;
};

const EXECUTE = process.argv.includes("--execute");
const PROFILE = resolveProfile("testnet");
const GATEWAY_ORIGIN = PROFILE.sodexSpotRest.replace(/\/api\/v1\/spot\/?$/, "");
const ADDRESS = engSodexAddress().toLowerCase();
const ACCOUNT_ID = engSodexAccountId();
let lastNonce = 0n;

function sleep(ms: number) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function asObject(value: unknown): Json {
  return value && typeof value === "object" ? (value as Json) : {};
}

function unwrapData(value: unknown): unknown {
  const root = asObject(value);
  return root.data ?? value;
}

function asArray(value: unknown, keys: string[] = []): Json[] {
  const data = unwrapData(value);
  if (Array.isArray(data)) return data.filter((v): v is Json => Boolean(v && typeof v === "object"));
  const obj = asObject(data);
  for (const key of keys) {
    if (Array.isArray(obj[key])) {
      return (obj[key] as unknown[]).filter(
        (v): v is Json => Boolean(v && typeof v === "object"),
      );
    }
  }
  return [];
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`GET ${url} -> HTTP ${response.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as unknown;
}

function nextNonce(): bigint {
  const now = BigInt(Date.now());
  lastNonce = now > lastNonce ? now : lastNonce + 1n;
  return lastNonce;
}

function decimalPlaces(value: string): number {
  return value.includes(".") ? value.split(".")[1]!.length : 0;
}

function decimalToUnits(value: string, scale: number): bigint {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid decimal: ${value}`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  const padded = fraction.padEnd(scale, "0");
  if (padded.length > scale && /[1-9]/.test(padded.slice(scale))) {
    throw new Error(`Decimal ${value} exceeds scale ${scale}`);
  }
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(padded.slice(0, scale) || "0");
}

function unitsToDecimal(units: bigint, scale: number): string {
  const factor = 10n ** BigInt(scale);
  const whole = units / factor;
  const fraction = (units % factor).toString().padStart(scale, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator;
}

function roundUpToStep(units: bigint, step: bigint): bigint {
  return ceilDiv(units, step) * step;
}

function roundDownToStep(units: bigint, step: bigint): bigint {
  return (units / step) * step;
}

function limitPrice(meta: SymbolMeta, reference: string, aggressive: boolean): string {
  const scale = Math.max(meta.pricePrecision, decimalPlaces(meta.tickSize));
  const referenceUnits = decimalToUnits(reference, scale);
  const tickUnits = decimalToUnits(meta.tickSize, scale);
  const minUnits = decimalToUnits(meta.minPrice || "0", scale);
  const adjusted = aggressive
    ? ceilDiv(referenceUnits * 10050n, 10000n)
    : (referenceUnits * 5000n) / 10000n;
  const quantized = aggressive
    ? roundUpToStep(adjusted, tickUnits)
    : roundDownToStep(adjusted, tickUnits);
  return unitsToDecimal(quantized > minUnits ? quantized : minUnits, scale);
}

function limitQuantity(meta: SymbolMeta, price: string, targetNotional: number): string {
  const priceScale = Math.max(meta.pricePrecision, decimalPlaces(meta.tickSize));
  const qtyScale = Math.max(meta.quantityPrecision, decimalPlaces(meta.stepSize));
  const priceUnits = decimalToUnits(price, priceScale);
  const stepUnits = decimalToUnits(meta.stepSize, qtyScale);
  const minQtyUnits = decimalToUnits(meta.minQuantity || "0", qtyScale);
  const numerator =
    BigInt(targetNotional) * 10n ** BigInt(priceScale + qtyScale);
  const required = ceilDiv(numerator, priceUnits);
  const quantized = roundUpToStep(required > minQtyUnits ? required : minQtyUnits, stepUnits);
  return unitsToDecimal(quantized, qtyScale);
}

function makeClientOrderId(symbolId: number, probeCase: ProbeCase): string {
  const tag =
    probeCase.kind === "LIMIT_IOC"
      ? "li"
      : probeCase.kind === "MARKET_IOC"
        ? "mi"
        : "lg";
  return `pr${symbolId}${tag}${probeCase.notionalUsd}${Date.now().toString(36)}`.slice(0, 36);
}

async function signedWrite(
  method: "POST" | "DELETE",
  actionType: string,
  body: Json,
  tradeAmountUsd: number,
): Promise<{ status: number; json: unknown }> {
  const nonce = nextNonce();
  const signed = await engSignExchangeAction({
    scope: "spot",
    chainId: PROFILE.chainId,
    actionType,
    params: body,
    nonce,
    network: "testnet",
    tradeAmountUsd,
  });
  if (signed.address.toLowerCase() !== ADDRESS) {
    throw new Error(`Signer mismatch: ${signed.address} != ${ADDRESS}`);
  }
  const response = await fetch(`${PROFILE.sodexSpotRest}${SPOT_TRADE_BATCH_PATH}`, {
    method,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "X-API-Sign": signed.apiSign,
      "X-API-Nonce": signed.nonce,
      "X-API-Chain": String(PROFILE.chainId),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: unknown = text;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    // Keep non-JSON gateway response as evidence.
  }
  return { status: response.status, json };
}

function gatewayResult(response: unknown): {
  code: number | null;
  error: string | null;
  accepted: boolean;
  orderID: number | null;
} {
  const root = asObject(response);
  const code = typeof root.code === "number" ? root.code : null;
  const topError =
    typeof root.error === "string"
      ? root.error
      : typeof root.message === "string"
        ? root.message
        : typeof root.msg === "string"
          ? root.msg
          : null;
  const legs = asArray(root.data);
  const leg = legs[0] ?? {};
  const legCode = typeof leg.code === "number" ? leg.code : null;
  const legError = typeof leg.error === "string" ? leg.error : null;
  const rawOrderID = leg.orderID ?? leg.orderId;
  const orderID =
    typeof rawOrderID === "number"
      ? rawOrderID
      : typeof rawOrderID === "string" && /^\d+$/.test(rawOrderID)
        ? Number(rawOrderID)
        : null;
  return {
    code: code ?? legCode,
    error: topError || legError,
    accepted: code === 0 && (legCode === null || legCode === 0) && orderID !== null,
    orderID,
  };
}

async function accountState(): Promise<Json> {
  return asObject(
    unwrapData(
      await getJson(`${PROFILE.sodexSpotRest}/accounts/${ADDRESS}/state`),
    ),
  );
}

async function balances(): Promise<Map<string, string>> {
  const response = await getJson(`${PROFILE.sodexSpotRest}/accounts/${ADDRESS}/balances`);
  const rows = asArray(response, ["balances", "B"]);
  return new Map(
    rows.map((row) => [
      String(row.coin ?? row.a ?? ""),
      String(row.total ?? row.t ?? "0"),
    ]),
  );
}

async function findOrder(
  symbol: string,
  clOrdID: string,
  orderID: number | null,
): Promise<Json | null> {
  const encodedSymbol = encodeURIComponent(symbol);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const [openResponse, historyResponse] = await Promise.all([
      getJson(
        `${PROFILE.sodexSpotRest}/accounts/${ADDRESS}/orders?symbol=${encodedSymbol}`,
      ),
      getJson(
        `${PROFILE.sodexSpotRest}/accounts/${ADDRESS}/orders/history?symbol=${encodedSymbol}&limit=100`,
      ),
    ]);
    const rows = [
      ...asArray(openResponse, ["orders", "O"]),
      ...asArray(historyResponse, ["orders", "O"]),
    ];
    const order = rows.find((row) => {
      const rowClOrdID = String(row.clOrdID ?? row.c ?? "");
      const rawID = row.orderID ?? row.orderId ?? row.i;
      return (
        rowClOrdID === clOrdID ||
        (orderID !== null && Number(rawID) === orderID)
      );
    });
    if (order) return order;
    await sleep(250);
  }
  return null;
}

async function findTrades(
  symbol: string,
  clOrdID: string,
  orderID: number | null,
): Promise<Json[]> {
  const encodedSymbol = encodeURIComponent(symbol);
  const response = await getJson(
    `${PROFILE.sodexSpotRest}/accounts/${ADDRESS}/trades?symbol=${encodedSymbol}&limit=100`,
  );
  return asArray(response, ["trades"]).filter((row) => {
    const rowClOrdID = String(row.clOrdID ?? row.c ?? "");
    const rawID = row.orderID ?? row.orderId ?? row.i;
    return (
      rowClOrdID === clOrdID ||
      (orderID !== null && Number(rawID) === orderID)
    );
  });
}

async function cancelRestingOrder(
  meta: SymbolMeta,
  orderID: number,
): Promise<ProbeOutcome["cancel"]> {
  const clOrdID = `pc${meta.id}${Date.now().toString(36)}`.slice(0, 36);
  const body = buildBatchCancelParams({
    accountID: ACCOUNT_ID,
    symbolID: meta.id,
    clOrdID,
    orderID,
  }) as Json;
  const response = await signedWrite("DELETE", SPOT_ACTION_BATCH_CANCEL, body, 0);
  const parsed = gatewayResult(response.json);
  return {
    attempted: true,
    accepted: parsed.code === 0,
    code: parsed.code,
    error: parsed.error,
  };
}

async function runCase(
  meta: SymbolMeta,
  referencePrice: string,
  probeCase: ProbeCase,
): Promise<ProbeOutcome> {
  const clOrdID = makeClientOrderId(meta.id, probeCase);
  const targetNotional = Math.max(
    probeCase.notionalUsd,
    Math.ceil(Number(meta.minNotional || "0")),
  );
  let order: Json;
  if (probeCase.kind === "MARKET_IOC") {
    order = {
      symbolID: meta.id,
      clOrdID,
      side: 1,
      type: 2,
      timeInForce: 3,
      funds: String(targetNotional),
    };
  } else {
    const price = limitPrice(
      meta,
      referencePrice,
      probeCase.kind === "LIMIT_IOC",
    );
    const quantity = limitQuantity(meta, price, targetNotional);
    order = {
      symbolID: meta.id,
      clOrdID,
      side: 1,
      type: 1,
      timeInForce: probeCase.kind === "LIMIT_IOC" ? 3 : 1,
      price,
      quantity,
    };
  }
  const body: Json = { accountID: ACCOUNT_ID, orders: [order] };
  const before = (await balances()).get(meta.baseCoin) ?? "0";
  const response = await signedWrite(
    "POST",
    SPOT_ACTION_BATCH_NEW,
    body,
    targetNotional,
  );
  const gateway = gatewayResult(response.json);
  let matchedOrder: Json | null = null;
  let trades: Json[] = [];
  let cancel: ProbeOutcome["cancel"] = {
    attempted: false,
    accepted: false,
    code: null,
    error: null,
  };

  if (gateway.accepted) {
    matchedOrder = await findOrder(meta.name, clOrdID, gateway.orderID);
    const status = String(
      matchedOrder?.status ?? matchedOrder?.X ?? "",
    ).toUpperCase();
    if (
      probeCase.kind === "LIMIT_GTC" &&
      gateway.orderID !== null &&
      (status === "NEW" || status === "PARTIALLY_FILLED")
    ) {
      cancel = await cancelRestingOrder(meta, gateway.orderID);
      await sleep(300);
      matchedOrder = await findOrder(meta.name, clOrdID, gateway.orderID);
    }
    await sleep(250);
    trades = await findTrades(meta.name, clOrdID, gateway.orderID);
  }

  await sleep(150);
  const after = (await balances()).get(meta.baseCoin) ?? "0";
  const status = matchedOrder
    ? String(matchedOrder.status ?? matchedOrder.X ?? "")
    : null;
  const executedQty = matchedOrder
    ? String(matchedOrder.executedQty ?? matchedOrder.z ?? "0")
    : null;
  const tradeIDs = trades
    .map((trade) => Number(trade.tradeID ?? trade.t))
    .filter(Number.isFinite);
  const balanceIncreased =
    Number.isFinite(Number(before)) && Number.isFinite(Number(after))
      ? Number(after) > Number(before)
      : null;
  const matcherAccepted = matchedOrder !== null;
  let reason: string | null = null;
  if (!gateway.accepted) reason = gateway.error || `gateway code ${gateway.code}`;
  else if (!matcherAccepted) reason = "gateway returned orderID but order was not found";
  else if (tradeIDs.length === 0 && probeCase.kind !== "LIMIT_GTC") {
    reason = `terminal ${status || "UNKNOWN"} with no fill`;
  }

  return {
    case: probeCase,
    clOrdID,
    request: body,
    gatewayHttpStatus: response.status,
    gatewayCode: gateway.code,
    gatewayError: gateway.error,
    gatewayAccepted: gateway.accepted,
    orderID: gateway.orderID,
    matcherAccepted,
    terminalStatus: status,
    executedQty,
    tradeIDs,
    balanceBefore: before,
    balanceAfter: after,
    balanceIncreased,
    cancel,
    reason,
  };
}

async function websocketTickerSymbols(): Promise<Set<string>> {
  const WebSocketCtor = (globalThis as unknown as {
    WebSocket?: new (url: string) => {
      onopen: (() => void) | null;
      onmessage: ((event: { data: unknown }) => void) | null;
      onerror: (() => void) | null;
      send(data: string): void;
      close(): void;
    };
  }).WebSocket;
  if (!WebSocketCtor) return new Set();

  return new Promise((resolveSymbols) => {
    const symbols = new Set<string>();
    const socket = new WebSocketCtor(PROFILE.sodexSpotWs);
    const timer = setTimeout(() => {
      socket.close();
      resolveSymbols(symbols);
    }, 8000);
    socket.onopen = () => {
      socket.send(
        JSON.stringify({
          op: "subscribe",
          id: 1,
          params: { channel: "allTicker" },
        }),
      );
    };
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(String(event.data)) as Json;
        if (message.channel !== "allTicker") return;
        for (const row of asArray(message.data)) {
          const symbol = String(row.s ?? "");
          if (symbol) symbols.add(symbol);
        }
        clearTimeout(timer);
        socket.close();
        resolveSymbols(symbols);
      } catch {
        // Retain timeout behavior as evidence that no parseable snapshot arrived.
      }
    };
    socket.onerror = () => {
      clearTimeout(timer);
      resolveSymbols(symbols);
    };
  });
}

async function main() {
  if (PROFILE.id !== "testnet" || PROFILE.chainId !== 138565) {
    throw new Error("This probe is hard-locked to SoDEX testnet");
  }

  const state = await accountState();
  const stateAddress = String(state.user ?? "").toLowerCase();
  const stateAccountID = Number(state.aid ?? state.accountID);
  if (stateAddress !== ADDRESS || stateAccountID !== ACCOUNT_ID) {
    throw new Error(
      `Account identity mismatch: env=${ADDRESS}/${ACCOUNT_ID}, protocol=${stateAddress}/${stateAccountID}`,
    );
  }

  const [symbolsResponse, tickersResponse, legacyResponse, bizResponse, wsSymbols] =
    await Promise.all([
      getJson(`${PROFILE.sodexSpotRest}/markets/symbols`),
      getJson(`${PROFILE.sodexSpotRest}/markets/tickers`),
      getJson(`${GATEWAY_ORIGIN}/pro/p/symbol/list`),
      getJson("https://testnet.sodex.dev/biz/config/symbol?env=testnet"),
      websocketTickerSymbols(),
    ]);

  const symbols = asArray(symbolsResponse) as unknown as SymbolMeta[];
  const legacyRows = asArray(legacyResponse) as unknown as LegacySymbol[];
  const legacyByName = new Map(legacyRows.map((row) => [row.symbol, row]));
  const tickerRows = asArray(tickersResponse);
  const tickerByName = new Map(
    tickerRows.map((row) => [
      String(row.symbol ?? row.s ?? row.name ?? ""),
      String(row.lastPx ?? row.lastPrice ?? row.c ?? row.price ?? "0"),
    ]),
  );
  const bizData = asObject(unwrapData(bizResponse));
  const bizSpot = new Set(
    Array.isArray(bizData.spot) ? bizData.spot.map((value) => String(value)) : [],
  );
  const explorerResponse = await getJson(
    `https://clobscan-testnet.sodex.dev/api/v1/spot/account/transactions?address=${ADDRESS}`,
  );
  const explorerTransactions = asArray(explorerResponse);
  const probeCases: ProbeCase[] = [
    { kind: "LIMIT_IOC", notionalUsd: 5 },
    { kind: "LIMIT_IOC", notionalUsd: 10 },
    { kind: "MARKET_IOC", notionalUsd: 5 },
    { kind: "MARKET_IOC", notionalUsd: 10 },
    { kind: "LIMIT_GTC", notionalUsd: 5 },
    { kind: "LIMIT_GTC", notionalUsd: 10 },
  ];

  const marketResults: Json[] = [];
  for (const meta of symbols) {
    const legacy = legacyByName.get(meta.name);
    const bookResponse = await getJson(
      `${PROFILE.sodexSpotRest}/markets/${encodeURIComponent(meta.name)}/orderbook?limit=20`,
    );
    const book = asObject(unwrapData(bookResponse));
    const bids = Array.isArray(book.bids) ? book.bids : Array.isArray(book.b) ? book.b : [];
    const asks = Array.isArray(book.asks) ? book.asks : Array.isArray(book.a) ? book.a : [];
    const bestBid = Array.isArray(bids[0]) ? String((bids[0] as unknown[])[0]) : null;
    const bestAsk = Array.isArray(asks[0]) ? String((asks[0] as unknown[])[0]) : null;
    const lastPrice = tickerByName.get(meta.name) ?? null;
    const referencePrice = bestAsk || bestBid || lastPrice;
    const outcomes: ProbeOutcome[] = [];

    if (EXECUTE && referencePrice && Number(referencePrice) > 0) {
      for (const probeCase of probeCases) {
        console.log(
          `[${meta.name}] ${probeCase.kind} $${probeCase.notionalUsd}`,
        );
        try {
          outcomes.push(await runCase(meta, referencePrice, probeCase));
        } catch (error) {
          outcomes.push({
            case: probeCase,
            clOrdID: "",
            request: {},
            gatewayHttpStatus: null,
            gatewayCode: null,
            gatewayError: null,
            gatewayAccepted: false,
            orderID: null,
            matcherAccepted: false,
            terminalStatus: null,
            executedQty: null,
            tradeIDs: [],
            balanceBefore: null,
            balanceAfter: null,
            balanceIncreased: null,
            cancel: {
              attempted: false,
              accepted: false,
              code: null,
              error: null,
            },
            reason: error instanceof Error ? error.message : String(error),
          });
        }
        await sleep(150);
      }
    }

    marketResults.push({
      symbol: meta.name,
      displayName: meta.displayName,
      internalId: meta.id,
      baseCoin: meta.baseCoin,
      quoteCoin: meta.quoteCoin,
      status: meta.status,
      legacyTradeSwitch: legacy?.tradeSwitch ?? null,
      supportedOrderTypes: legacy?.supportOrderType ?? null,
      supportedTimeInForce: legacy?.supportTimeInForce ?? null,
      bizConfigListed: legacy ? bizSpot.has(legacy.name) : false,
      tickSize: meta.tickSize,
      pricePrecision: meta.pricePrecision,
      quantityPrecision: meta.quantityPrecision,
      minQuantity: meta.minQuantity,
      marketMinQuantity: meta.marketMinQuantity,
      minNotional: meta.minNotional,
      stepSize: meta.stepSize,
      bestBid,
      bestAsk,
      lastPrice,
      websocketTickerPresent: wsSymbols.has(meta.name),
      dryPayloadPossible: Boolean(referencePrice && Number(referencePrice) > 0),
      outcomes,
    });
  }

  const result = {
    generatedAt: new Date().toISOString(),
    mode: EXECUTE ? "REAL_SIGNED_TESTNET_WRITES" : "READ_ONLY",
    network: PROFILE.id,
    chainId: PROFILE.chainId,
    identity: {
      environmentAddress: ADDRESS,
      environmentAccountID: ACCOUNT_ID,
      protocolAddress: stateAddress,
      protocolAccountID: stateAccountID,
      matched: stateAddress === ADDRESS && stateAccountID === ACCOUNT_ID,
    },
    explorer: {
      endpoint: `https://clobscan-testnet.sodex.dev/api/v1/spot/account/transactions?address=${ADDRESS}`,
      transactionCount: explorerTransactions.length,
    },
    markets: marketResults,
  };

  const target = resolve(process.cwd(), "../../MARKET_PROBE_TESTNET.json");
  writeFileSync(target, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`Wrote ${target}`);

  try {
    const { reloadCapabilitiesFromProbe } = await import(
      "../src/services/marketCapability.js"
    );
    const seeded = await reloadCapabilitiesFromProbe("testnet");
    console.log(`Seeded capability store rows=${seeded}`);
  } catch (error) {
    console.warn(
      `Capability seed skipped: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
