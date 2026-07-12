/**
 * Market Eligibility Engine — 15-stage gate before any market is shown or submitted.
 * Official sources: GET /markets/symbols (status), orderbook, tickers.
 * Dry-validate formatting + EIP-712 payload without submitting.
 */
import type { HatchProfile } from "../config/environment.js";
import { createSodexClient } from "../clients/sodex.js";
import { redisGet, redisSet } from "../lib/redis.js";
import {
  formatDecimal,
  formatPrice,
  getTickSize,
  type SpotSymbolMeta,
} from "./sodexSymbols.js";
import {
  SPOT_ACTION_BATCH_NEW,
  buildBatchNewOrdersParams,
} from "./spotOrders.js";
import { payloadHashFromAction } from "./sodexSign.js";

/** Max mid-spread for family invest eligibility. */
export const MAX_ELIGIBLE_SPREAD_PCT = 0.05;

const BLOCKED = new Set([
  "CANCEL_ONLY",
  "CANCELONLY",
  "HALT",
  "SUSPENDED",
  "BREAK",
  "DISABLED",
  "INACTIVE",
  "CLOSED",
  "MAINTENANCE",
  "POST_ONLY",
  "POSTONLY",
  "READONLY",
  "READ_ONLY",
  "REJECT_ONLY",
  "REJECTONLY",
  "PAUSED",
  "FROZEN",
  "SETTLEMENT_DISABLED",
  "SETTLEMENTDISABLED",
]);

export type EligibilityStageId =
  | "exists"
  | "visible"
  | "trading_enabled"
  | "not_cancel_only"
  | "not_maintenance"
  | "gateway_accepts"
  | "orderbook_valid"
  | "ask_exists"
  | "bid_exists"
  | "spread_ok"
  | "min_notional"
  | "tick_compatible"
  | "precision_compatible"
  | "ioc_accepted"
  | "dry_validation";

export type EligibilityStage = {
  id: EligibilityStageId;
  stage: number;
  name: string;
  pass: boolean;
  detail?: string;
};

export type MarketEligibility = {
  symbol: string;
  marketId: number;
  base: string;
  quote: string;
  status: string;
  eligible: boolean;
  tradingEnabled: boolean;
  cancelOnly: boolean;
  maintenance: boolean;
  gatewayValidation: "PASS" | "FAIL";
  lastVerified: string;
  failReason: string | null;
  stages: EligibilityStage[];
  bestAsk: number | null;
  bestBid: number | null;
  midPrice: number | null;
  lastPrice: number | null;
  spreadPct: number | null;
  askDepthUsd: number;
  bidDepthUsd: number;
  estimatedFillProbability: number;
  expectedSlippageBps: number | null;
  score: number;
  dry: {
    limitPrice: string | null;
    quantity: string | null;
    payloadHash: string | null;
    ok: boolean;
    error: string | null;
  };
  meta: SpotSymbolMeta | null;
};

function asNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeInstrumentStatus(raw: string): string {
  return String(raw || "UNKNOWN")
    .toUpperCase()
    .replace(/[-\s]/g, "_")
    .replace(/_+/g, "_");
}

export function humanFailReason(stages: EligibilityStage[]): string {
  const cancel = stages.find((s) => s.id === "not_cancel_only" && !s.pass);
  if (cancel) return "Cancel Only";
  const maint = stages.find((s) => s.id === "not_maintenance" && !s.pass);
  if (maint) return "Maintenance";
  const fail = stages.find((s) => !s.pass);
  if (!fail) return "Unavailable";
  switch (fail.id) {
    case "exists":
    case "visible":
      return "Hidden";
    case "trading_enabled":
      return "Disabled";
    case "not_cancel_only":
      return "Cancel Only";
    case "not_maintenance":
      return "Maintenance";
    case "gateway_accepts":
    case "dry_validation":
      return fail.detail?.toLowerCase().includes("tick")
        ? "TickSize Error"
        : fail.detail?.toLowerCase().includes("precision")
          ? "Precision Error"
          : "Gateway Rejects Orders";
    case "orderbook_valid":
      return "Empty orderbook";
    case "ask_exists":
      return "Empty Ask Book";
    case "bid_exists":
      return "Empty Bid Book";
    case "spread_ok":
      return "Spread too large";
    case "min_notional":
      return "Insufficient liquidity";
    case "tick_compatible":
      return "TickSize Error";
    case "precision_compatible":
      return "Precision Error";
    case "ioc_accepted":
      return "Unsupported";
    default:
      return fail.name;
  }
}

function stage(
  n: number,
  id: EligibilityStageId,
  name: string,
  pass: boolean,
  detail?: string,
): EligibilityStage {
  return { id, stage: n, name, pass, detail };
}

export function unwrapSymbolList(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const k of ["data", "symbols", "list", "result"]) {
      if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
    }
  }
  return [];
}

export function parseMetaRow(row: Record<string, unknown>): SpotSymbolMeta | null {
  const id = asNum(row.id ?? row.symbolID);
  const name = String(row.name ?? row.symbol ?? "");
  if (!id || !name) return null;
  const pricePrecision = asNum(row.pricePrecision, 4);
  const tickFromApi = asNum(row.tickSize);
  return {
    id,
    name,
    baseCoin: String(row.baseCoin ?? ""),
    minNotional: asNum(row.minNotional, 5),
    minQuantity: asNum(row.minQuantity ?? row.marketMinQuantity, 0.01),
    stepSize: asNum(row.stepSize, 0.01),
    quantityPrecision: asNum(row.quantityPrecision, 2),
    pricePrecision,
    tickSize: tickFromApi > 0 ? tickFromApi : Math.pow(10, -Math.max(0, pricePrecision)),
    status: String(row.status ?? "UNKNOWN"),
  };
}

/** Dry-validate LIMIT+IOC buy sizing + EIP-712 payload (never submits). */
export function dryValidateBuyOrder(input: {
  meta: SpotSymbolMeta;
  bestAsk: number;
  notionalUsd: number;
  maxSlippageBps: number;
  accountID?: number;
}): {
  ok: boolean;
  error: string | null;
  limitPrice: string | null;
  quantity: string | null;
  payloadHash: string | null;
  tickOk: boolean;
  precisionOk: boolean;
  minNotionalOk: boolean;
} {
  try {
    const tick = getTickSize(input.meta);
    if (!(tick > 0) || !(input.bestAsk > 0)) {
      return {
        ok: false,
        error: "invalid tickSize or ask",
        limitPrice: null,
        quantity: null,
        payloadHash: null,
        tickOk: false,
        precisionOk: false,
        minNotionalOk: false,
      };
    }
    const slip = Math.max(0, input.maxSlippageBps) / 10_000;
    const limitPx = input.bestAsk * (1 + slip);
    const price = formatPrice(limitPx, input.meta);
    const priceNum = Number(price);
    if (!(priceNum > 0) || /[eE]/.test(price)) {
      return {
        ok: false,
        error: "price format invalid",
        limitPrice: price,
        quantity: null,
        payloadHash: null,
        tickOk: false,
        precisionOk: false,
        minNotionalOk: false,
      };
    }
    const ticks = priceNum / tick;
    const tickOk = Math.abs(ticks - Math.round(ticks)) < 1e-5;

    const step = input.meta.stepSize > 0 ? input.meta.stepSize : 0.01;
    const rawQty = Math.max(
      input.notionalUsd / input.bestAsk,
      input.meta.minNotional / input.bestAsk,
      input.meta.minQuantity,
    );
    const stepped = Math.ceil(rawQty / step - 1e-12) * step;
    const quantity = formatDecimal(stepped, step, "round");
    const qtyNum = Number(quantity);
    if (!(qtyNum > 0) || /[eE]/.test(quantity)) {
      return {
        ok: false,
        error: "quantity precision invalid",
        limitPrice: price,
        quantity,
        payloadHash: null,
        tickOk,
        precisionOk: false,
        minNotionalOk: false,
      };
    }

    const notional = priceNum * qtyNum;
    const minNotionalOk = notional + 1e-9 >= input.meta.minNotional;
    if (!minNotionalOk) {
      return {
        ok: false,
        error: `minNotional not reachable (${notional} < ${input.meta.minNotional})`,
        limitPrice: price,
        quantity,
        payloadHash: null,
        tickOk,
        precisionOk: true,
        minNotionalOk: false,
      };
    }

    const priceDecimals = (price.split(".")[1] || "").length;
    const qtyDecimals = (quantity.split(".")[1] || "").length;
    const precisionOk =
      priceDecimals <= Math.max(0, input.meta.pricePrecision + 2) &&
      qtyDecimals <= Math.max(0, input.meta.quantityPrecision + 2);
    if (!precisionOk) {
      return {
        ok: false,
        error: "precision incompatible with symbol metadata",
        limitPrice: price,
        quantity,
        payloadHash: null,
        tickOk,
        precisionOk: false,
        minNotionalOk,
      };
    }

    const accountID = input.accountID && input.accountID > 0 ? input.accountID : 1;
    const params = buildBatchNewOrdersParams({
      accountID,
      orders: [
        {
          symbolID: input.meta.id,
          clOrdID: `dry${Date.now()}`.slice(0, 32),
          side: 1,
          type: 1,
          timeInForce: 3,
          price,
          quantity,
        },
      ],
    });
    const payloadHash = payloadHashFromAction(SPOT_ACTION_BATCH_NEW, params);
    if (!/^0x[a-fA-F0-9]{64}$/.test(payloadHash)) {
      return {
        ok: false,
        error: "EIP712 payloadHash invalid",
        limitPrice: price,
        quantity,
        payloadHash,
        tickOk,
        precisionOk,
        minNotionalOk,
      };
    }

    return {
      ok: tickOk && precisionOk && minNotionalOk,
      error: tickOk ? null : "tickSize misaligned",
      limitPrice: price,
      quantity,
      payloadHash,
      tickOk,
      precisionOk,
      minNotionalOk,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      limitPrice: null,
      quantity: null,
      payloadHash: null,
      tickOk: false,
      precisionOk: false,
      minNotionalOk: false,
    };
  }
}

/**
 * Evaluate all 15 eligibility stages for one market.
 */
export function evaluateMarketEligibility(input: {
  meta: SpotSymbolMeta | null;
  bookData: Record<string, unknown> | null;
  bookError?: string | null;
  ticker?: Record<string, unknown> | null;
  notionalUsd: number;
  maxSlippageBps?: number;
  accountID?: number;
  gatewayReachable: boolean;
  lastVerified?: string;
}): MarketEligibility {
  const verified = input.lastVerified ?? new Date().toISOString();
  const notional = Math.max(0, input.notionalUsd);
  const maxSlip = input.maxSlippageBps ?? 50;
  const meta = input.meta;
  const symbol = meta?.name ?? "UNKNOWN";
  const st = normalizeInstrumentStatus(meta?.status ?? "");
  const bids = Array.isArray(input.bookData?.bids)
    ? (input.bookData!.bids as [string, string][])
    : [];
  const asks = Array.isArray(input.bookData?.asks)
    ? (input.bookData!.asks as [string, string][])
    : [];
  const bestBid = bids[0] ? asNum(bids[0][0]) : null;
  const bestAsk = asks[0] ? asNum(asks[0][0]) : null;
  const askDepthUsd = asks.reduce((s, r) => s + asNum(r[0]) * asNum(r[1]), 0);
  const bidDepthUsd = bids.reduce((s, r) => s + asNum(r[0]) * asNum(r[1]), 0);
  const mid =
    bestBid != null && bestAsk != null ? (bestBid + bestAsk) / 2 : bestAsk ?? bestBid;
  const spreadPct =
    bestBid != null && bestAsk != null && mid && mid > 0
      ? (bestAsk - bestBid) / mid
      : null;
  const lastPrice =
    asNum(input.ticker?.lastPx ?? input.ticker?.lastPrice ?? input.ticker?.close, 0) ||
    bestAsk ||
    bestBid;
  const quote = String(input.ticker?.quoteCoin ?? "vUSDC");

  const cancelOnly = st === "CANCEL_ONLY" || st === "CANCELONLY";
  const maintenance = st === "MAINTENANCE";
  const tradingEnabled =
    !!meta &&
    !BLOCKED.has(st) &&
    !cancelOnly &&
    !maintenance &&
    (st === "TRADING" || st === "UNKNOWN" || st === "");

  const stages: EligibilityStage[] = [];
  stages.push(
    stage(1, "exists", "Exists", !!meta && meta.id > 0, meta ? `id=${meta.id}` : "missing"),
  );
  const visible = !!meta?.name;
  stages.push(stage(2, "visible", "Visible", visible, symbol));
  stages.push(
    stage(
      3,
      "trading_enabled",
      "Trading enabled",
      tradingEnabled,
      `status=${meta?.status ?? "n/a"}`,
    ),
  );
  stages.push(stage(4, "not_cancel_only", "NOT cancel only", !cancelOnly, st || "n/a"));
  stages.push(stage(5, "not_maintenance", "NOT maintenance", !maintenance, st || "n/a"));
  const gatewayOk = input.gatewayReachable && !input.bookError;
  stages.push(
    stage(
      6,
      "gateway_accepts",
      "Gateway accepts submissions",
      gatewayOk,
      input.bookError ? String(input.bookError).slice(0, 80) : "orderbook HTTP ok",
    ),
  );
  const bookValid = !!input.bookData && !input.bookError;
  stages.push(
    stage(
      7,
      "orderbook_valid",
      "Orderbook valid",
      bookValid,
      `bids=${bids.length} asks=${asks.length}`,
    ),
  );
  stages.push(
    stage(
      8,
      "ask_exists",
      "Ask exists",
      bestAsk != null && bestAsk > 0 && asks.length > 0,
      bestAsk != null ? String(bestAsk) : "none",
    ),
  );
  stages.push(
    stage(
      9,
      "bid_exists",
      "Bid exists",
      bestBid != null && bestBid > 0 && bids.length > 0,
      bestBid != null ? String(bestBid) : "none",
    ),
  );
  const spreadOk = spreadPct != null && spreadPct <= MAX_ELIGIBLE_SPREAD_PCT;
  stages.push(
    stage(
      10,
      "spread_ok",
      "Spread acceptable",
      spreadOk,
      spreadPct != null
        ? `${(spreadPct * 100).toFixed(2)}% (max ${(MAX_ELIGIBLE_SPREAD_PCT * 100).toFixed(0)}%)`
        : "n/a",
    ),
  );
  const depthNeed = Math.max(
    meta?.minNotional ?? 5,
    notional > 0 ? notional : meta?.minNotional ?? 5,
  );
  const depthOk = askDepthUsd + 1e-9 >= depthNeed;
  stages.push(
    stage(
      11,
      "min_notional",
      "MinNotional reachable",
      depthOk,
      `askDepthUsd=${askDepthUsd.toFixed(2)} need=${depthNeed}`,
    ),
  );

  let dry = {
    ok: false,
    error: "missing ask or meta" as string | null,
    limitPrice: null as string | null,
    quantity: null as string | null,
    payloadHash: null as string | null,
    tickOk: false,
    precisionOk: false,
    minNotionalOk: false,
  };
  if (meta && bestAsk && bestAsk > 0) {
    dry = dryValidateBuyOrder({
      meta,
      bestAsk,
      notionalUsd: Math.max(notional, meta.minNotional),
      maxSlippageBps: maxSlip,
      accountID: input.accountID,
    });
  }

  stages.push(
    stage(
      12,
      "tick_compatible",
      "TickSize compatible",
      !!meta && dry.tickOk,
      meta ? `tick=${meta.tickSize}` : "n/a",
    ),
  );
  stages.push(
    stage(
      13,
      "precision_compatible",
      "Precision compatible",
      dry.precisionOk,
      dry.error ?? "ok",
    ),
  );
  stages.push(
    stage(14, "ioc_accepted", "IOC accepted", !!meta && dry.ok, "LIMIT+IOC dry payload"),
  );
  stages.push(
    stage(
      15,
      "dry_validation",
      "Dry validation passes",
      dry.ok,
      dry.ok ? `price=${dry.limitPrice} qty=${dry.quantity}` : dry.error ?? "fail",
    ),
  );

  const eligible = stages.every((s) => s.pass);
  const failReason = eligible ? null : humanFailReason(stages);

  const depthCover =
    notional > 0 && askDepthUsd > 0
      ? Math.min(1, askDepthUsd / notional)
      : askDepthUsd > 0
        ? 1
        : 0;
  const fillProb = eligible ? Math.min(0.98, 0.4 + 0.5 * depthCover) : 0;
  let liq = 0;
  if (bestAsk) liq += 40;
  if (bestBid) liq += 10;
  liq += Math.min(30, askDepthUsd / 50);
  if (spreadPct != null) liq -= Math.min(25, spreadPct * 100);
  const score = eligible
    ? Math.round((liq * 0.7 + fillProb * 100 * 0.3) * 100) / 100
    : 0;

  return {
    symbol,
    marketId: meta?.id ?? 0,
    base: meta?.baseCoin ?? "",
    quote,
    status: meta?.status ?? "UNKNOWN",
    eligible,
    tradingEnabled,
    cancelOnly,
    maintenance,
    gatewayValidation: gatewayOk && dry.ok ? "PASS" : "FAIL",
    lastVerified: verified,
    failReason,
    stages,
    bestAsk: bestAsk && bestAsk > 0 ? bestAsk : null,
    bestBid: bestBid && bestBid > 0 ? bestBid : null,
    midPrice: mid && mid > 0 ? mid : null,
    lastPrice: lastPrice && lastPrice > 0 ? lastPrice : null,
    spreadPct,
    askDepthUsd,
    bidDepthUsd,
    estimatedFillProbability: Math.round(fillProb * 1000) / 1000,
    expectedSlippageBps: eligible
      ? Math.min(100, Math.round((1 - depthCover) * 40 + (spreadPct ?? 0) * 5000))
      : null,
    score,
    dry: {
      limitPrice: dry.limitPrice,
      quantity: dry.quantity,
      payloadHash: dry.payloadHash,
      ok: dry.ok,
      error: dry.error,
    },
    meta,
  };
}

/** Live capability probe (no order submit). Cached ~45s. */
export async function liveCapabilityProbe(input: {
  profile: HatchProfile;
  symbol: string;
  notionalUsd: number;
  maxSlippageBps?: number;
  accountID?: number;
}): Promise<MarketEligibility> {
  const cacheKey = `elig:probe:${input.profile.id}:${input.symbol}:${Math.round(input.notionalUsd)}`;
  const hit = await redisGet(cacheKey);
  if (hit) {
    try {
      return JSON.parse(hit) as MarketEligibility;
    } catch {
      /* continue */
    }
  }

  const client = createSodexClient(input.profile);
  let gatewayReachable = true;
  let meta: SpotSymbolMeta | null = null;
  let bookData: Record<string, unknown> | null = null;
  let bookError: string | null = null;
  let ticker: Record<string, unknown> | null = null;

  try {
    const [symRaw, tickRaw] = await Promise.all([
      client.marketsSymbols(),
      client.marketsTickers(),
    ]);
    const list = unwrapSymbolList(symRaw);
    const row = list.find(
      (r) =>
        String(r.name ?? r.symbol ?? "").toUpperCase() === input.symbol.toUpperCase(),
    );
    if (row) meta = parseMetaRow(row);
    const ticks = unwrapSymbolList(tickRaw);
    ticker =
      ticks.find(
        (t) =>
          String(t.symbol ?? t.name ?? "").toUpperCase() ===
          input.symbol.toUpperCase(),
      ) ?? null;
  } catch (e) {
    gatewayReachable = false;
    bookError = String(e);
  }

  try {
    const raw = await client.orderbook(input.symbol, 20);
    bookData =
      raw && typeof raw === "object" && "data" in (raw as object)
        ? ((raw as { data: unknown }).data as Record<string, unknown>)
        : (raw as Record<string, unknown>);
  } catch (e) {
    bookError = String(e);
    gatewayReachable = false;
  }

  const result = evaluateMarketEligibility({
    meta,
    bookData,
    bookError,
    ticker,
    notionalUsd: input.notionalUsd,
    maxSlippageBps: input.maxSlippageBps,
    accountID: input.accountID,
    gatewayReachable,
  });

  await redisSet(cacheKey, JSON.stringify(result), 45);
  return result;
}
