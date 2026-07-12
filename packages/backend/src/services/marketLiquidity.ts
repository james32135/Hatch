/**
 * Live SoDEX market liquidity scan + suitability scoring.
 * Official sources only: markets/symbols, markets/tickers, markets/{sym}/orderbook.
 * Never invent depth or prices.
 */
import type { HatchProfile } from "../config/environment.js";
import { createSodexClient } from "../clients/sodex.js";
import {
  formatDecimal,
  formatPrice,
  type SpotSymbolMeta,
} from "./sodexSymbols.js";

export type MarketSnapshot = {
  symbol: string;
  marketId: number;
  base: string;
  quote: string;
  status: string;
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
  score: number;
  executable: boolean;
  rejectReasons: string[];
  meta: SpotSymbolMeta;
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

function scoreMarket(m: Omit<MarketSnapshot, "score" | "executable" | "rejectReasons">): {
  score: number;
  executable: boolean;
  rejectReasons: string[];
} {
  const rejectReasons: string[] = [];
  if (m.status !== "TRADING") rejectReasons.push(`status=${m.status}`);
  if (m.bestAsk == null || m.askDepthLevels === 0) rejectReasons.push("empty_asks");
  if (m.askDepthUsd + 1e-9 < m.minNotional) rejectReasons.push("ask_depth_below_minNotional");
  if (m.spreadPct != null && m.spreadPct > 0.25) rejectReasons.push("abnormal_spread");
  if (!/_vUSDC$/i.test(m.symbol) && !m.quote.toUpperCase().includes("USDC")) {
    rejectReasons.push("non_usdc_quote");
  }

  let score = 0;
  if (m.bestAsk != null && m.askDepthLevels > 0) score += 40;
  score += Math.min(30, m.askDepthUsd / 50);
  score += Math.min(20, m.quoteVolume24h / 500);
  if (m.spreadPct != null) score -= Math.min(25, m.spreadPct * 100);
  if (/mag7ssi/i.test(m.symbol)) score += 12;
  else if (/ussi/i.test(m.symbol) && /ssi/i.test(m.symbol)) score += 10;
  else if (/ssi/i.test(m.symbol)) score += 6;

  const executable = rejectReasons.length === 0 && score > 0;
  if (!executable && rejectReasons.length === 0) rejectReasons.push("score_zero");
  return { score: Math.round(score * 100) / 100, executable, rejectReasons };
}

/** Scan all SoDEX spot markets with live books + tickers. */
export async function scanExecutableMarkets(
  profile: HatchProfile,
): Promise<MarketSnapshot[]> {
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

  // Parallel orderbooks (bounded concurrency)
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
      const spreadPct =
        spread != null && mid && mid > 0 ? spread / mid : null;
      const t = tickerBySym.get(meta.name) || {};
      const base: Omit<MarketSnapshot, "score" | "executable" | "rejectReasons"> = {
        symbol: meta.name,
        marketId: meta.id,
        base: meta.baseCoin,
        quote: String((t as any).quoteCoin ?? "vUSDC"),
        status: meta.status,
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
        supportsMarket: true,
        meta,
      };
      if (err) {
        out.push({
          ...base,
          score: 0,
          executable: false,
          rejectReasons: [`orderbook_error:${err.slice(0, 80)}`],
        });
        continue;
      }
      const scored = scoreMarket(base);
      out.push({ ...base, ...scored });
    }
  }

  return out.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
}

export type RiskTier = "CONSERVATIVE" | "BALANCED" | "GROWTH";

/** Preference order for Path A indices — never hardcodes a fill market if illiquid. */
export function preferredSymbolOrder(tier: RiskTier): RegExp[] {
  if (tier === "CONSERVATIVE") {
    return [/vUSSI_vUSDC/i, /vMAG7ssi_vUSDC/i, /ssi.*_vUSDC/i];
  }
  if (tier === "GROWTH") {
    return [/vMAG7ssi_vUSDC/i, /ssi.*_vUSDC/i, /vUSSI_vUSDC/i];
  }
  return [/vMAG7ssi_vUSDC/i, /vUSSI_vUSDC/i, /ssi.*_vUSDC/i];
}

export type ExecutionRoute = {
  market: MarketSnapshot;
  notionalUsd: number;
  maxSlippageBps: number;
  limitPrice: string;
  quantity: string;
  referenceAsk: number;
  why: string;
  considered: Array<{ symbol: string; score: number; executable: boolean; reasons: string[] }>;
  scannedAt: string;
};

/**
 * Deterministic route: prefer Path A indices when executable; else highest score.
 * Never selects empty-ask markets.
 */
export function selectExecutionRoute(input: {
  riskTier: RiskTier;
  notionalUsd: number;
  maxSlippageBps: number;
  markets: MarketSnapshot[];
}): ExecutionRoute {
  const executable = input.markets.filter((m) => m.executable);
  const considered = input.markets.slice(0, 24).map((m) => ({
    symbol: m.symbol,
    score: m.score,
    executable: m.executable,
    reasons: m.rejectReasons,
  }));

  if (input.notionalUsd + 1e-9 < 1) {
    throw Object.assign(new Error("notional too small"), { code: "notional_too_small" });
  }

  const prefs = preferredSymbolOrder(input.riskTier);
  let chosen: MarketSnapshot | undefined;
  let why = "";

  for (const re of prefs) {
    const hit = executable
      .filter((m) => re.test(m.symbol) && input.notionalUsd + 1e-9 >= m.minNotional)
      .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))[0];
    if (hit) {
      chosen = hit;
      why = `Preferred pattern ${re} matched executable ${hit.symbol} (score=${hit.score}, askDepthUsd=${hit.askDepthUsd.toFixed(2)}, bestAsk=${hit.bestAsk}).`;
      break;
    }
  }

  if (!chosen) {
    chosen = executable
      .filter((m) => input.notionalUsd + 1e-9 >= m.minNotional)
      .sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol))[0];
    if (chosen) {
      why = `No preferred Path A index had asks. Routed to highest-score executable ${chosen.symbol} (score=${chosen.score}, askDepthUsd=${chosen.askDepthUsd.toFixed(2)}, bestAsk=${chosen.bestAsk}).`;
    }
  }

  if (!chosen || chosen.bestAsk == null) {
    const mag = input.markets.find((m) => /vMAG7ssi_vUSDC/i.test(m.symbol));
    const detail = mag
      ? `MAG7 asks=${mag.askDepthLevels} reject=${mag.rejectReasons.join(",")}`
      : "MAG7 not in symbol list";
    throw Object.assign(
      new Error(
        `No executable SoDEX market for $${input.notionalUsd}. ${detail}. Refusing to submit into empty books.`,
      ),
      { code: "no_executable_liquidity", details: { considered } },
    );
  }

  const slip = Math.max(0, input.maxSlippageBps) / 10_000;
  const ref = chosen.bestAsk;
  const limitPx = ref * (1 + slip);
  const price = formatPrice(limitPx, chosen.meta);
  const step = chosen.stepSize > 0 ? chosen.stepSize : 0.01;
  const rawQty = Math.max(input.notionalUsd / ref, chosen.minNotional / ref);
  const stepped = Math.ceil(rawQty / step - 1e-12) * step;
  const quantity = formatDecimal(stepped, step, "round");

  return {
    market: chosen,
    notionalUsd: input.notionalUsd,
    maxSlippageBps: input.maxSlippageBps,
    limitPrice: price,
    quantity,
    referenceAsk: ref,
    why,
    considered,
    scannedAt: new Date().toISOString(),
  };
}
