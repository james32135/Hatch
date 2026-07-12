/**
 * Live SoDEX Market Discovery Engine.
 * Official sources only: markets/symbols, markets/tickers, markets/{sym}/orderbook.
 * No preferred symbols. No hardcoded MAG7/USSI/SSI selection.
 */
import type { HatchProfile } from "../config/environment.js";
import { createSodexClient } from "../clients/sodex.js";
import {
  formatDecimal,
  formatPrice,
  type SpotSymbolMeta,
} from "./sodexSymbols.js";

/** Exchange statuses that must never receive new risk-increasing orders. */
const BLOCKED_STATUSES = new Set([
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
]);

export type MarketSnapshot = {
  symbol: string;
  marketId: number;
  base: string;
  quote: string;
  status: string;
  lastPrice: number | null;
  midPrice: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  spreadPct: number | null;
  bidDepthLevels: number;
  askDepthLevels: number;
  bidDepthQty: number;
  askDepthQty: number;
  askDepthUsd: number;
  bidDepthUsd: number;
  volume24h: number;
  quoteVolume24h: number;
  minNotional: number;
  tickSize: number;
  stepSize: number;
  pricePrecision: number;
  quantityPrecision: number;
  supportsLimit: boolean;
  supportsIoc: boolean;
  supportsMarket: boolean;
  liquidityScore: number;
  executionScore: number;
  score: number;
  expectedSlippageBps: number | null;
  estimatedFillProbability: number;
  executable: boolean;
  rejectReasons: string[];
  unavailableReason: string | null;
  meta: SpotSymbolMeta;
};

/** Full report returned for every investment discovery. */
export type MarketExecutionReport = {
  scannedAt: string;
  profileId: string;
  network: string;
  notionalUsd: number;
  scanned: number;
  available: MarketSnapshot[];
  unavailable: Array<{
    symbol: string;
    marketId: number;
    base: string;
    status: string;
    reason: string;
    rejectReasons: string[];
    score: number;
    askDepthUsd: number;
    bestAsk: number | null;
  }>;
  topExecutable: MarketSnapshot[];
};

export type ExecutionRoute = {
  market: MarketSnapshot;
  notionalUsd: number;
  maxSlippageBps: number;
  limitPrice: string;
  quantity: string;
  referenceAsk: number;
  why: string;
  considered: Array<{
    symbol: string;
    score: number;
    executable: boolean;
    reasons: string[];
  }>;
  scannedAt: string;
  report: MarketExecutionReport;
};

function asNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function unwrapList(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data as Record<string, unknown>[];
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const k of ["data", "symbols", "list", "result"]) {
      if (Array.isArray(o[k])) return o[k] as Record<string, unknown>[];
    }
  }
  return [];
}

function normalizeStatus(raw: string): string {
  return String(raw || "UNKNOWN")
    .toUpperCase()
    .replace(/[-\s]/g, "_")
    .replace(/_+/g, "_");
}

function humanReason(reasons: string[], status: string): string {
  if (reasons.includes("cancel_only")) return "Cancel only";
  if (reasons.includes("maintenance")) return "Maintenance";
  if (reasons.includes("trading_disabled")) return "Trading disabled";
  if (reasons.includes("empty_asks")) return "Empty orderbook (asks)";
  if (reasons.includes("empty_bids")) return "Empty orderbook (bids)";
  if (reasons.includes("ask_depth_below_minNotional")) return "Insufficient liquidity";
  if (reasons.includes("abnormal_spread")) return "Spread too large";
  if (reasons.includes("non_usdc_quote")) return "Unsupported quote";
  if (reasons.includes("minNotional_impossible")) return "Min notional impossible";
  if (status && status !== "TRADING") return `Status: ${status}`;
  return reasons[0] || "Unavailable";
}

function parseMeta(row: Record<string, unknown>): SpotSymbolMeta | null {
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

function scoreMarket(
  m: Omit<
    MarketSnapshot,
    | "score"
    | "executable"
    | "rejectReasons"
    | "unavailableReason"
    | "liquidityScore"
    | "executionScore"
    | "expectedSlippageBps"
    | "estimatedFillProbability"
  >,
  notionalUsd: number,
): Pick<
  MarketSnapshot,
  | "score"
  | "executable"
  | "rejectReasons"
  | "unavailableReason"
  | "liquidityScore"
  | "executionScore"
  | "expectedSlippageBps"
  | "estimatedFillProbability"
> {
  const rejectReasons: string[] = [];
  const st = normalizeStatus(m.status);

  if (st === "CANCEL_ONLY" || st === "CANCELONLY") rejectReasons.push("cancel_only");
  else if (st === "MAINTENANCE") rejectReasons.push("maintenance");
  else if (BLOCKED_STATUSES.has(st) || (st && st !== "TRADING" && st !== "UNKNOWN" && st !== "")) {
    rejectReasons.push("trading_disabled");
  }

  if (m.bestAsk == null || m.askDepthLevels === 0) rejectReasons.push("empty_asks");
  if (m.bestBid == null || m.bidDepthLevels === 0) rejectReasons.push("empty_bids");
  const depthNeed = Math.max(m.minNotional, notionalUsd > 0 ? notionalUsd : m.minNotional);
  if (m.askDepthUsd + 1e-9 < depthNeed) {
    rejectReasons.push("ask_depth_below_minNotional");
  }
  if (m.spreadPct != null && m.spreadPct > 0.25) rejectReasons.push("abnormal_spread");
  if (!/_vUSDC$/i.test(m.symbol) && !m.quote.toUpperCase().includes("USDC")) {
    rejectReasons.push("non_usdc_quote");
  }
  if (!(m.bestAsk != null && m.bestAsk > 0) && !rejectReasons.includes("empty_asks")) {
    rejectReasons.push("minNotional_impossible");
  }

  let liquidityScore = 0;
  if (m.bestAsk != null && m.askDepthLevels > 0) liquidityScore += 40;
  if (m.bestBid != null && m.bidDepthLevels > 0) liquidityScore += 10;
  liquidityScore += Math.min(30, m.askDepthUsd / 50);
  liquidityScore += Math.min(15, m.quoteVolume24h / 500);
  if (m.spreadPct != null) liquidityScore -= Math.min(25, m.spreadPct * 100);

  const depthCover =
    notionalUsd > 0 && m.askDepthUsd > 0
      ? Math.min(1, m.askDepthUsd / notionalUsd)
      : m.askDepthUsd > 0
        ? 1
        : 0;
  let fillProb = 0;
  if (rejectReasons.length === 0) {
    fillProb = 0.35 + 0.55 * depthCover;
    if (m.spreadPct != null && m.spreadPct < 0.01) fillProb += 0.08;
    fillProb = Math.min(0.98, Math.max(0, fillProb));
  }

  const expectedSlippageBps =
    m.bestAsk != null && m.askDepthUsd > 0
      ? Math.min(
          200,
          Math.round(
            (1 - Math.min(1, depthCover)) * 80 + (m.spreadPct ?? 0) * 10_000 * 0.5,
          ),
        )
      : null;

  const executionScore =
    Math.round((liquidityScore * 0.7 + fillProb * 100 * 0.3) * 100) / 100;
  const score = Math.round(executionScore * 100) / 100;

  const executable = rejectReasons.length === 0 && score > 0 && m.bestAsk != null;
  const unavailableReason = executable ? null : humanReason(rejectReasons, m.status);

  return {
    score,
    liquidityScore: Math.round(liquidityScore * 100) / 100,
    executionScore,
    expectedSlippageBps,
    estimatedFillProbability: Math.round(fillProb * 1000) / 1000,
    executable,
    rejectReasons,
    unavailableReason,
  };
}

/** Scan all SoDEX spot markets with live books + tickers. */
export async function scanExecutableMarkets(
  profile: HatchProfile,
  opts?: { notionalUsd?: number },
): Promise<MarketSnapshot[]> {
  const notionalUsd = opts?.notionalUsd ?? 0;
  const client = createSodexClient(profile);
  const [symRaw, tickRaw] = await Promise.all([
    client.marketsSymbols(),
    client.marketsTickers(),
  ]);
  const symbols = unwrapList(symRaw).map(parseMeta).filter(Boolean) as SpotSymbolMeta[];
  const tickers = unwrapList(tickRaw);
  const tickerBySym = new Map<string, Record<string, unknown>>();
  for (const t of tickers) {
    const name = String(t.symbol ?? t.name ?? "");
    if (name) tickerBySym.set(name, t);
  }

  const out: MarketSnapshot[] = [];
  const chunk = 8;
  for (let i = 0; i < symbols.length; i += chunk) {
    const slice = symbols.slice(i, i + chunk);
    const books = await Promise.all(
      slice.map(async (meta) => {
        try {
          const raw = await client.orderbook(meta.name, 20);
          const data =
            raw && typeof raw === "object" && "data" in (raw as object)
              ? ((raw as { data: unknown }).data as Record<string, unknown>)
              : (raw as Record<string, unknown>);
          return { meta, data, err: null as string | null };
        } catch (e) {
          return { meta, data: null, err: String(e) };
        }
      }),
    );
    for (const { meta, data, err } of books) {
      const bids = Array.isArray(data?.bids) ? (data!.bids as [string, string][]) : [];
      const asks = Array.isArray(data?.asks) ? (data!.asks as [string, string][]) : [];
      const bestBid = bids[0] ? asNum(bids[0][0]) : null;
      const bestAsk = asks[0] ? asNum(asks[0][0]) : null;
      const bidDepthQty = bids.reduce((s, r) => s + asNum(r[1]), 0);
      const askDepthQty = asks.reduce((s, r) => s + asNum(r[1]), 0);
      const askDepthUsd = asks.reduce((s, r) => s + asNum(r[0]) * asNum(r[1]), 0);
      const bidDepthUsd = bids.reduce((s, r) => s + asNum(r[0]) * asNum(r[1]), 0);
      const spread =
        bestBid != null && bestAsk != null && bestAsk > 0 ? bestAsk - bestBid : null;
      const mid =
        bestBid != null && bestAsk != null
          ? (bestBid + bestAsk) / 2
          : bestAsk ?? bestBid;
      const spreadPct = spread != null && mid && mid > 0 ? spread / mid : null;
      const t = tickerBySym.get(meta.name) || {};
      const lastPrice = asNum(t.lastPx ?? t.lastPrice ?? t.close, 0) || null;
      const baseFields = {
        symbol: meta.name,
        marketId: meta.id,
        base: meta.baseCoin,
        quote: String((t as { quoteCoin?: string }).quoteCoin ?? "vUSDC"),
        status: meta.status,
        lastPrice: lastPrice && lastPrice > 0 ? lastPrice : bestAsk ?? bestBid,
        midPrice: mid && mid > 0 ? mid : null,
        bestBid: bestBid && bestBid > 0 ? bestBid : null,
        bestAsk: bestAsk && bestAsk > 0 ? bestAsk : null,
        spread,
        spreadPct,
        bidDepthLevels: bids.length,
        askDepthLevels: asks.length,
        bidDepthQty,
        askDepthQty,
        askDepthUsd,
        bidDepthUsd,
        volume24h: asNum(t.volume ?? t.baseVolume),
        quoteVolume24h: asNum(t.quoteVolume),
        minNotional: meta.minNotional,
        tickSize: meta.tickSize,
        stepSize: meta.stepSize,
        pricePrecision: meta.pricePrecision,
        quantityPrecision: meta.quantityPrecision,
        supportsLimit: true,
        supportsIoc: true,
        supportsMarket: false,
        meta,
      };
      if (err) {
        out.push({
          ...baseFields,
          score: 0,
          liquidityScore: 0,
          executionScore: 0,
          expectedSlippageBps: null,
          estimatedFillProbability: 0,
          executable: false,
          rejectReasons: [`orderbook_error:${err.slice(0, 80)}`],
          unavailableReason: "Orderbook unavailable",
        });
        continue;
      }
      const scored = scoreMarket(baseFields, notionalUsd);
      out.push({ ...baseFields, ...scored });
    }
  }

  return out.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
}

export function buildMarketExecutionReport(input: {
  markets: MarketSnapshot[];
  profile: HatchProfile;
  notionalUsd: number;
}): MarketExecutionReport {
  const available = input.markets
    .filter((m) => m.executable && input.notionalUsd + 1e-9 >= m.minNotional)
    .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  const unavailable = input.markets
    .filter((m) => !available.some((a) => a.symbol === m.symbol))
    .map((m) => ({
      symbol: m.symbol,
      marketId: m.marketId,
      base: m.base,
      status: m.status,
      reason: m.unavailableReason || humanReason(m.rejectReasons, m.status),
      rejectReasons: m.rejectReasons,
      score: m.score,
      askDepthUsd: m.askDepthUsd,
      bestAsk: m.bestAsk,
    }));

  return {
    scannedAt: new Date().toISOString(),
    profileId: input.profile.id,
    network: input.profile.id === "mainnet" ? "mainnet" : "testnet",
    notionalUsd: input.notionalUsd,
    scanned: input.markets.length,
    available,
    unavailable,
    topExecutable: available.slice(0, 12),
  };
}

function sizeOrder(
  market: MarketSnapshot,
  notionalUsd: number,
  maxSlippageBps: number,
): { limitPrice: string; quantity: string; referenceAsk: number } {
  if (market.bestAsk == null) {
    throw Object.assign(new Error("Market has no ask"), {
      code: "no_executable_liquidity",
    });
  }
  const slip = Math.max(0, maxSlippageBps) / 10_000;
  const ref = market.bestAsk;
  const limitPx = ref * (1 + slip);
  const price = formatPrice(limitPx, market.meta);
  const step = market.stepSize > 0 ? market.stepSize : 0.01;
  const rawQty = Math.max(notionalUsd / ref, market.minNotional / ref);
  const stepped = Math.ceil(rawQty / step - 1e-12) * step;
  const quantity = formatDecimal(stepped, step, "round");
  return { limitPrice: price, quantity, referenceAsk: ref };
}

/**
 * Build an execution route from live discovery.
 * - If chosenSymbol / chosenMarketId provided: must be currently executable.
 * - Else: highest executionScore (no preferred-symbol bias).
 */
export function selectExecutionRoute(input: {
  notionalUsd: number;
  maxSlippageBps: number;
  markets: MarketSnapshot[];
  profile: HatchProfile;
  chosenSymbol?: string;
  chosenMarketId?: number;
}): ExecutionRoute {
  if (input.notionalUsd + 1e-9 < 1) {
    throw Object.assign(new Error("notional too small"), {
      code: "notional_too_small",
    });
  }

  const report = buildMarketExecutionReport({
    markets: input.markets,
    profile: input.profile,
    notionalUsd: input.notionalUsd,
  });

  const considered = input.markets.slice(0, 32).map((m) => ({
    symbol: m.symbol,
    score: m.score,
    executable: m.executable,
    reasons: m.rejectReasons,
  }));

  let chosen: MarketSnapshot | undefined;
  let why = "";

  if (input.chosenMarketId != null || input.chosenSymbol) {
    chosen = report.available.find(
      (m) =>
        (input.chosenMarketId != null && m.marketId === input.chosenMarketId) ||
        (input.chosenSymbol &&
          m.symbol.toUpperCase() === input.chosenSymbol.toUpperCase()),
    );
    if (!chosen) {
      const raw = input.markets.find(
        (m) =>
          (input.chosenMarketId != null && m.marketId === input.chosenMarketId) ||
          (input.chosenSymbol &&
            m.symbol.toUpperCase() === input.chosenSymbol.toUpperCase()),
      );
      throw Object.assign(
        new Error(
          raw
            ? `${raw.symbol} is not executable right now: ${raw.unavailableReason || raw.rejectReasons.join(", ")}`
            : `Chosen market not found in live SoDEX scan`,
        ),
        {
          code: "market_not_executable",
          details: {
            considered,
            reportSummary: { available: report.available.length },
          },
        },
      );
    }
    why = `Parent selected ${chosen.symbol} from live discovery (score=${chosen.score}, askDepthUsd=${chosen.askDepthUsd.toFixed(2)}, fillProb=${chosen.estimatedFillProbability}, bestAsk=${chosen.bestAsk}).`;
  } else {
    chosen = report.available[0];
    if (chosen) {
      why = `Highest live execution score: ${chosen.symbol} (score=${chosen.score}, askDepthUsd=${chosen.askDepthUsd.toFixed(2)}, fillProb=${chosen.estimatedFillProbability}, bestAsk=${chosen.bestAsk}). No preferred-symbol bias.`;
    }
  }

  if (!chosen || chosen.bestAsk == null) {
    throw Object.assign(
      new Error(
        `No executable SoDEX market for $${input.notionalUsd}. Scanned ${report.scanned}; available ${report.available.length}. Refusing empty / blocked books.`,
      ),
      {
        code: "no_executable_liquidity",
        details: {
          considered,
          unavailable: report.unavailable.slice(0, 20),
        },
      },
    );
  }

  const sized = sizeOrder(chosen, input.notionalUsd, input.maxSlippageBps);

  return {
    market: chosen,
    notionalUsd: input.notionalUsd,
    maxSlippageBps: input.maxSlippageBps,
    limitPrice: sized.limitPrice,
    quantity: sized.quantity,
    referenceAsk: sized.referenceAsk,
    why,
    considered,
    scannedAt: report.scannedAt,
    report,
  };
}

/** Re-check a single market is still executable immediately before relay. */
export async function assertMarketStillExecutable(input: {
  profile: HatchProfile;
  symbol: string;
  notionalUsd: number;
}): Promise<MarketSnapshot> {
  const markets = await scanExecutableMarkets(input.profile, {
    notionalUsd: input.notionalUsd,
  });
  const hit = markets.find(
    (m) => m.symbol.toUpperCase() === input.symbol.toUpperCase(),
  );
  if (!hit || !hit.executable || hit.bestAsk == null) {
    throw Object.assign(
      new Error(
        hit
          ? `${input.symbol} no longer executable: ${hit.unavailableReason || hit.rejectReasons.join(", ")}`
          : `${input.symbol} missing from live scan`,
      ),
      { code: "market_not_executable" },
    );
  }
  if (input.notionalUsd + 1e-9 < hit.minNotional) {
    throw Object.assign(
      new Error(
        `Notional below minNotional ${hit.minNotional} for ${hit.symbol}`,
      ),
      { code: "notional_too_small" },
    );
  }
  return hit;
}

/** @deprecated No preferred markets — always returns []. */
export type RiskTier = "CONSERVATIVE" | "BALANCED" | "GROWTH";
export function preferredSymbolOrder(_tier: RiskTier): RegExp[] {
  return [];
}
