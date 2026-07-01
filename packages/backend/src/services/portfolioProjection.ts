/**
 * Portfolio USD projection from live SoSoValue + SoDEX account state.
 * Never invents prices — fails closed if snapshot unavailable.
 */
import { getSoSoValueClient } from "../clients/sosovalue.js";
import { HatchError } from "../lib/errors.js";

export interface PortfolioProjection {
  totalUsd: number | null;
  components: Array<{
    symbol: string;
    qty: number | null;
    priceUsd: number | null;
    valueUsd: number | null;
  }>;
  source: "sosovalue+sodex";
  pricedAt: string;
  warnings: string[];
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

/** Best-effort extract qty map from SoDEX account state JSON */
export function extractBalances(state: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!state || typeof state !== "object") return out;
  const root = state as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;
  const bags = [
    data.balances,
    data.assets,
    data.coins,
    data.B,
    data.spotBalances,
    data.vaultBalances,
    root.balances,
  ];
  for (const bag of bags) {
    if (!Array.isArray(bag)) continue;
    for (const row of bag) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const sym = String(
        r.coin ?? r.symbol ?? r.asset ?? r.name ?? r.a ?? r.token ?? "",
      );
      const qty = asNumber(
        r.available ??
          r.balance ??
          r.qty ??
          r.quantity ??
          r.free ??
          r.total ??
          r.t,
      );
      if (sym && qty !== null) {
        out[sym] = (out[sym] ?? 0) + qty;
      }
    }
  }
  // Object-map form: { "vUSDC": "12.3", ... }
  for (const candidate of [data.balanceMap, root.balanceMap]) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
      continue;
    for (const [sym, v] of Object.entries(candidate as Record<string, unknown>)) {
      const qty = asNumber(v);
      if (sym && qty !== null) out[sym] = (out[sym] ?? 0) + qty;
    }
  }
  return out;
}

/** Pull USD prices from SoSoValue market snapshot — structure varies; fail soft per asset */
export function extractPrices(snapshot: unknown): Record<string, number> {
  const prices: Record<string, number> = {};
  if (!snapshot || typeof snapshot !== "object") return prices;

  const walk = (node: unknown, depth = 0) => {
    if (depth > 6 || !node) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, depth + 1);
      return;
    }
    if (typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const sym = o.symbol ?? o.index ?? o.name ?? o.ticker;
    const px =
      asNumber(o.price) ??
      asNumber(o.lastPrice) ??
      asNumber(o.close) ??
      asNumber(o.usd) ??
      asNumber(o.value);
    if (typeof sym === "string" && px !== null) {
      prices[sym] = px;
      prices[sym.toUpperCase()] = px;
    }
    for (const v of Object.values(o)) walk(v, depth + 1);
  };
  walk(snapshot);
  return prices;
}

/** Match vault / index symbols to SoSoValue tickers without inventing prices */
export function resolvePriceUsd(
  symbol: string,
  prices: Record<string, number>,
): number | null {
  const candidates = [
    symbol,
    symbol.toUpperCase(),
    symbol.replace(/^v/i, ""),
    symbol.replace(/\.ssi$/i, ""),
    symbol.replace(/^v/i, "").replace(/\.ssi$/i, ""),
  ];
  // Common aliases
  if (/mag7/i.test(symbol)) {
    candidates.push("MAG7.ssi", "vMAG7.ssi", "MAG7");
  }
  if (/ussi/i.test(symbol)) {
    candidates.push("USSI", "vUSSI");
  }
  if (/usdc/i.test(symbol)) {
    return prices[symbol] ?? prices.USDC ?? prices.vUSDC ?? 1;
  }
  for (const c of candidates) {
    if (prices[c] !== undefined) return prices[c];
    const hit = Object.entries(prices).find(
      ([k]) => k.toLowerCase() === c.toLowerCase(),
    );
    if (hit) return hit[1];
  }
  return null;
}

export async function projectPortfolioUsd(
  sodexAccountState: unknown,
): Promise<PortfolioProjection> {
  const warnings: string[] = [];
  let snapshot: unknown;
  try {
    snapshot = await getSoSoValueClient().marketSnapshot();
  } catch (err) {
    throw new HatchError(
      "unavailable",
      `SoSoValue market snapshot failed: ${err instanceof Error ? err.message : String(err)}`,
      502,
    );
  }

  const balances = extractBalances(sodexAccountState);
  const prices = extractPrices(snapshot);
  // Stablecoin / vault quote peg — not invented market prices
  for (const peg of ["USDC", "vUSDC", "USDT", "vUSDT"]) {
    if (prices[peg] === undefined) prices[peg] = 1;
  }
  const components: PortfolioProjection["components"] = [];
  let total = 0;
  let anyPriced = false;

  for (const [symbol, qty] of Object.entries(balances)) {
    const priceUsd = resolvePriceUsd(symbol, prices);
    const valueUsd = priceUsd !== null ? qty * priceUsd : null;
    if (valueUsd !== null) {
      total += valueUsd;
      anyPriced = true;
    } else {
      warnings.push(`No live USD price for ${symbol}`);
    }
    components.push({ symbol, qty, priceUsd, valueUsd });
  }

  if (!Object.keys(balances).length) {
    warnings.push("No balances found in SoDEX account state");
  }

  return {
    totalUsd: anyPriced ? total : null,
    components,
    source: "sosovalue+sodex",
    pricedAt: new Date().toISOString(),
    warnings,
  };
}
