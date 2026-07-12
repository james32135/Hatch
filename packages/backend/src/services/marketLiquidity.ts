/**
 * Live SoDEX market discovery — public reads + dry gates + signed capability.
 * Only matcher-capable markets are executable / buyable.
 */
import type { HatchProfile } from "../config/environment.js";
import { createSodexClient } from "../clients/sodex.js";
import type { SpotSymbolMeta } from "./sodexSymbols.js";
import { formatDecimal, formatPrice } from "./sodexSymbols.js";
import {
  evaluateMarketEligibility,
  liveCapabilityProbe,
  parseMetaRow,
  unwrapSymbolList,
  type MarketEligibility,
} from "./marketEligibility.js";
import {
  getSymbolCapability,
  type CapabilityLabel,
} from "./marketCapability.js";

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
  /** Eligibility engine fields */
  tradingEnabled: boolean;
  cancelOnly: boolean;
  maintenance: boolean;
  gatewayValidation: CapabilityLabel;
  matcherCapable: boolean;
  fillCapable: boolean;
  verifiedSafe: false;
  lastVerified: string;
  eligibility: MarketEligibility;
  meta: SpotSymbolMeta;
};

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
    tradingEnabled: boolean;
    cancelOnly: boolean;
    maintenance: boolean;
    gatewayValidation: CapabilityLabel;
    matcherCapable: boolean;
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

function eligibilityToSnapshot(
  elig: MarketEligibility,
  ticker: Record<string, unknown> | null,
): MarketSnapshot | null {
  if (!elig.meta) return null;
  const meta = elig.meta;
  const bids = elig.bestBid != null ? 1 : 0;
  const asks = elig.bestAsk != null ? 1 : 0;
  return {
    symbol: elig.symbol,
    marketId: elig.marketId,
    base: elig.base,
    quote: elig.quote,
    status: elig.status,
    lastPrice: elig.lastPrice,
    midPrice: elig.midPrice,
    bestBid: elig.bestBid,
    bestAsk: elig.bestAsk,
    spread:
      elig.bestBid != null && elig.bestAsk != null
        ? elig.bestAsk - elig.bestBid
        : null,
    spreadPct: elig.spreadPct,
    bidDepthLevels: bids,
    askDepthLevels: asks,
    bidDepthQty: 0,
    askDepthQty: 0,
    askDepthUsd: elig.askDepthUsd,
    bidDepthUsd: elig.bidDepthUsd,
    volume24h: asNum(ticker?.volume ?? ticker?.baseVolume),
    quoteVolume24h: asNum(ticker?.quoteVolume),
    minNotional: meta.minNotional,
    tickSize: meta.tickSize,
    stepSize: meta.stepSize,
    pricePrecision: meta.pricePrecision,
    quantityPrecision: meta.quantityPrecision,
    supportsLimit: true,
    supportsIoc: true,
    supportsMarket: false,
    liquidityScore: elig.score,
    executionScore: elig.score,
    score: elig.score,
    expectedSlippageBps: elig.expectedSlippageBps,
    estimatedFillProbability: elig.estimatedFillProbability,
    executable: elig.eligible,
    rejectReasons: elig.stages.filter((s) => !s.pass).map((s) => s.id),
    unavailableReason: elig.failReason,
    tradingEnabled: elig.tradingEnabled,
    cancelOnly: elig.cancelOnly,
    maintenance: elig.maintenance,
    gatewayValidation: elig.gatewayValidation,
    matcherCapable: elig.matcherCapable,
    fillCapable: elig.fillCapable,
    verifiedSafe: false,
    lastVerified: elig.lastVerified,
    eligibility: elig,
    meta,
  };
}

/** Scan all SoDEX spot markets through the eligibility engine. */
export async function scanExecutableMarkets(
  profile: HatchProfile,
  opts?: { notionalUsd?: number; maxSlippageBps?: number; accountID?: number },
): Promise<MarketSnapshot[]> {
  const notionalUsd = opts?.notionalUsd ?? 0;
  const maxSlippageBps = opts?.maxSlippageBps ?? 50;
  const client = createSodexClient(profile);
  const [symRaw, tickRaw] = await Promise.all([
    client.marketsSymbols(),
    client.marketsTickers(),
  ]);
  const symbols = unwrapSymbolList(symRaw)
    .map(parseMetaRow)
    .filter(Boolean) as SpotSymbolMeta[];
  const tickers = unwrapSymbolList(tickRaw);
  const tickerBySym = new Map<string, Record<string, unknown>>();
  for (const t of tickers) {
    const name = String(t.symbol ?? t.name ?? "");
    if (name) tickerBySym.set(name, t);
  }

  const out: MarketSnapshot[] = [];
  const chunk = 8;
  const verifiedAt = new Date().toISOString();

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
          return { meta, data, err: null as string | null, gateway: true };
        } catch (e) {
          return {
            meta,
            data: null as Record<string, unknown> | null,
            err: String(e),
            gateway: false,
          };
        }
      }),
    );

    for (const { meta, data, err, gateway } of books) {
      const capability = await getSymbolCapability({
        network: profile.id === "mainnet" ? "mainnet" : "testnet",
        symbol: meta.name,
      });
      const elig = evaluateMarketEligibility({
        meta,
        bookData: data,
        bookError: err,
        ticker: tickerBySym.get(meta.name) ?? null,
        notionalUsd,
        maxSlippageBps,
        accountID: opts?.accountID,
        gatewayReachable: gateway,
        lastVerified: verifiedAt,
        capability,
      });
      const snap = eligibilityToSnapshot(elig, tickerBySym.get(meta.name) ?? null);
      if (snap) out.push(snap);
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
      reason: m.unavailableReason || "Unavailable",
      rejectReasons: m.rejectReasons,
      score: m.score,
      askDepthUsd: m.askDepthUsd,
      bestAsk: m.bestAsk,
      tradingEnabled: m.tradingEnabled,
      cancelOnly: m.cancelOnly,
      maintenance: m.maintenance,
      gatewayValidation: m.gatewayValidation,
      matcherCapable: m.matcherCapable,
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
  const price = formatPrice(ref * (1 + slip), market.meta);
  const step = market.stepSize > 0 ? market.stepSize : 0.01;
  const rawQty = Math.max(notionalUsd / ref, market.minNotional / ref);
  const stepped = Math.ceil(rawQty / step - 1e-12) * step;
  const quantity = formatDecimal(stepped, step, "round");
  return { limitPrice: price, quantity, referenceAsk: ref };
}

/**
 * Route only from eligibility-passed markets.
 * chosenSymbol must pass live eligibility (re-probed).
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
            ? `${raw.symbol} failed eligibility: ${raw.unavailableReason || raw.rejectReasons.join(", ")}`
            : `Chosen market not found in live SoDEX scan`,
        ),
        {
          code: "market_not_executable",
          details: { considered },
        },
      );
    }
    if (!chosen.executable || !chosen.matcherCapable || chosen.cancelOnly) {
      throw Object.assign(
        new Error(
          `${chosen.symbol} not matcher-capable (${chosen.gatewayValidation})`,
        ),
        { code: "market_not_executable" },
      );
    }
    why = `Parent selected matcher-capable ${chosen.symbol} (score=${chosen.score}, capability=${chosen.gatewayValidation}, askDepthUsd=${chosen.askDepthUsd.toFixed(2)}, verified=${chosen.lastVerified}).`;
  } else {
    chosen = report.available[0];
    if (chosen) {
      why = `Highest matcher-capable score: ${chosen.symbol} (score=${chosen.score}, capability=${chosen.gatewayValidation}). No preferred-symbol bias.`;
    }
  }

  if (!chosen || chosen.bestAsk == null || !chosen.executable) {
    throw Object.assign(
      new Error(
        `No eligible SoDEX market for $${input.notionalUsd}. Scanned ${report.scanned}; available ${report.available.length}.`,
      ),
      {
        code: "no_executable_liquidity",
        details: { unavailable: report.unavailable.slice(0, 20) },
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

/** Re-check public book + signed capability immediately before relay. */
export async function assertMarketStillExecutable(input: {
  profile: HatchProfile;
  symbol: string;
  notionalUsd: number;
}): Promise<MarketSnapshot> {
  const elig = await liveCapabilityProbe({
    profile: input.profile,
    symbol: input.symbol,
    notionalUsd: input.notionalUsd,
  });
  if (
    !elig.eligible ||
    !elig.matcherCapable ||
    elig.cancelOnly ||
    elig.bestAsk == null
  ) {
    throw Object.assign(
      new Error(
        `${input.symbol} no longer executable: ${elig.failReason || elig.gatewayValidation}`,
      ),
      { code: "market_not_executable" },
    );
  }
  if (input.notionalUsd + 1e-9 < (elig.meta?.minNotional ?? 5)) {
    throw Object.assign(
      new Error(
        `Notional below minNotional ${elig.meta?.minNotional} for ${elig.symbol}`,
      ),
      { code: "notional_too_small" },
    );
  }
  const snap = eligibilityToSnapshot(elig, null);
  if (!snap) {
    throw Object.assign(new Error(`${input.symbol} missing meta`), {
      code: "market_not_executable",
    });
  }
  return snap;
}

export type RiskTier = "CONSERVATIVE" | "BALANCED" | "GROWTH";
export function preferredSymbolOrder(_tier: RiskTier): RegExp[] {
  return [];
}
