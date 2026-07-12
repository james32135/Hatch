/**
 * Parent-owned SoDEX spot-account valuation.
 * Uses the same SoDEX asset-price feed as the official portfolio UI, with
 * SoSoValue and SoDEX last-trade prices only as fallback coverage.
 * Empty balances → totalUsd: 0 (not null).
 */
import { getSoSoValueClient } from "../clients/sosovalue.js";

export interface PortfolioProjection {
  totalUsd: number | null;
  components: Array<{
    symbol: string;
    qty: number | null;
    priceUsd: number | null;
    valueUsd: number | null;
  }>;
  source:
    | "sodex-asset-prices"
    | "sodex-asset-prices+sosovalue"
    | "sosovalue+sodex"
    | "sodex";
  valuationMethod: "sodex_asset_price" | "sodex_last_trade";
  valuationScope: "spot_trading_value";
  pricedAt: string;
  warnings: string[];
  diagnostics: string[];
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return null;
}

/** Merge one balance row into out map */
function ingestRow(out: Record<string, number>, row: unknown): void {
  if (!row || typeof row !== "object") return;
  const r = row as Record<string, unknown>;
  const sym = String(
    r.coin ??
      r.symbol ??
      r.asset ??
      r.name ??
      r.a ??
      r.token ??
      r.coinName ??
      r.assetName ??
      "",
  ).trim();
  if (!sym) return;

  const available = asNumber(
    r.available ?? r.balance ?? r.qty ?? r.quantity ?? r.free ?? r.avail,
  );
  const locked = asNumber(r.locked ?? r.freeze ?? r.frozen ?? r.lock);
  const total = asNumber(r.total ?? r.t ?? r.walletBalance);
  let qty: number | null = total;
  if (qty === null && (available !== null || locked !== null)) {
    qty = (available ?? 0) + (locked ?? 0);
  }
  if (qty === null) return;
  out[sym] = (out[sym] ?? 0) + qty;
}

/** Best-effort extract qty map from SoDEX account state / balances JSON */
export function extractBalances(state: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!state || typeof state !== "object") return out;

  const visit = (node: unknown, depth = 0) => {
    if (depth > 8 || node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) {
        if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          // Row-like object with a coin/symbol field
          if (
            o.coin != null ||
            o.symbol != null ||
            o.asset != null ||
            o.token != null ||
            o.coinName != null ||
            o.a != null
          ) {
            ingestRow(out, item);
          } else {
            visit(item, depth + 1);
          }
        }
      }
      return;
    }
    if (typeof node !== "object") return;
    const root = node as Record<string, unknown>;
    const bags = [
      root.balances,
      root.assets,
      root.coins,
      root.B,
      root.spotBalances,
      root.vaultBalances,
      root.data,
      root.list,
      root.result,
      root.items,
    ];
    for (const bag of bags) {
      if (bag !== undefined) visit(bag, depth + 1);
    }
    // Object-map form: { "vUSDC": "12.3", ... }
    for (const key of ["balanceMap", "balance"]) {
      const candidate = root[key];
      if (
        candidate &&
        typeof candidate === "object" &&
        !Array.isArray(candidate)
      ) {
        for (const [sym, v] of Object.entries(
          candidate as Record<string, unknown>,
        )) {
          if (typeof v === "object" && v !== null) {
            ingestRow(out, { ...(v as object), coin: sym });
          } else {
            const qty = asNumber(v);
            if (sym && qty !== null) out[sym] = (out[sym] ?? 0) + qty;
          }
        }
      }
    }
  };

  visit(state);
  return out;
}

/** Merge multiple SoDEX payloads — never sum state+balances (same account, duplicate rows). */
export function mergeBalanceSources(
  ...sources: Array<unknown | null | undefined>
): Record<string, number> {
  const parsed = sources
    .map((src) => extractBalances(src))
    .filter((part) => Object.keys(part).length > 0);
  if (!parsed.length) return {};
  return parsed.reduce((best, part) =>
    Object.keys(part).length > Object.keys(best).length ? part : best,
  );
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

/** Official SoDEX portfolio UI asset-price rows from GET /bolt/coins. */
export function extractSodexAssetPrices(payload: unknown): Record<string, number> {
  const prices: Record<string, number> = {};
  const rows = Array.isArray((payload as { data?: unknown })?.data)
    ? ((payload as { data: unknown[] }).data)
    : Array.isArray(payload)
      ? payload
      : [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const symbol = String(row.name ?? row.symbol ?? "").trim();
    const price = asNumber(row.price ?? row.usdPrice);
    if (!symbol || price === null || price < 0) continue;
    prices[symbol] = price;
    prices[symbol.toUpperCase()] = price;
  }
  return prices;
}

async function loadSodexAssetPrices(profileId?: string | null): Promise<Record<string, number>> {
  const { resolveProfile } = await import("../config/environment.js");
  const { getEnv } = await import("../config/env.js");
  const profile = resolveProfile(profileId ?? getEnv().HATCH_DEFAULT_PROFILE);
  const gateway = new URL(profile.sodexSpotRest).origin;
  const res = await fetch(`${gateway}/bolt/coins`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`SoDEX asset prices ${res.status}`);
  return extractSodexAssetPrices(await res.json());
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
  if (/mag7/i.test(symbol)) {
    candidates.push("MAG7.ssi", "vMAG7.ssi", "MAG7", "ssiMAG7", "vMAG7ssi");
  }
  if (/ussi/i.test(symbol)) {
    candidates.push("USSI", "vUSSI", "ssiUSSI");
  }
  if (/defi/i.test(symbol)) {
    candidates.push("DEFI.ssi", "ssiDeFi", "DEFI");
  }
  if (/meme/i.test(symbol)) {
    candidates.push("MEME.ssi", "ssiMeme", "MEME");
  }
  if (/usdc|usdt/i.test(symbol)) {
    return prices[symbol] ?? prices.USDC ?? prices.vUSDC ?? 1;
  }
  if (/^(w)?soso$/i.test(symbol) || /wsoso/i.test(symbol)) {
    return (
      prices[symbol] ??
      prices.SOSO ??
      prices.WSOSO ??
      prices.soso ??
      null
    );
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

/** Merge SoDEX market tickers into a price map (vault base symbols + SOSO aliases). */
export function supplementPricesFromSodexTickers(
  prices: Record<string, number>,
  tickers: unknown,
): void {
  const list = Array.isArray((tickers as { data?: unknown }).data)
    ? (tickers as { data: unknown[] }).data
    : Array.isArray(tickers)
      ? tickers
      : [];
  for (const t of list) {
    const row = t as Record<string, unknown>;
    const sym = String(row.symbol ?? "");
    const px = Number(row.lastPx ?? row.bidPx ?? 0);
    if (!sym || !(px > 0)) continue;
    const base = sym.split("_")[0];
    if (base && prices[base] === undefined) prices[base] = px;
    if (prices[sym] === undefined) prices[sym] = px;
    if (/^w?soso$/i.test(base)) {
      if (prices.SOSO === undefined) prices.SOSO = px;
      if (prices.WSOSO === undefined) prices.WSOSO = px;
      if (prices.soso === undefined) prices.soso = px;
    }
  }
}

export async function projectPortfolioUsd(
  sodexAccountState: unknown,
  sodexBalances?: unknown,
  profileId?: string | null,
): Promise<PortfolioProjection> {
  const warnings: string[] = [];
  const diagnostics: string[] = [];
  let snapshotOk = false;
  let officialPricesOk = false;
  const prices: Record<string, number> = {};

  try {
    Object.assign(prices, await loadSodexAssetPrices(profileId));
    officialPricesOk = Object.keys(prices).length > 0;
  } catch (err) {
    diagnostics.push(
      `SoDEX asset prices unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  try {
    const snapshot = await getSoSoValueClient().marketSnapshot();
    const snapshotPrices = extractPrices(snapshot);
    for (const [symbol, price] of Object.entries(snapshotPrices)) {
      if (prices[symbol] === undefined) prices[symbol] = price;
    }
    snapshotOk = true;
  } catch (err) {
    diagnostics.push(
      `SoSoValue market snapshot unavailable: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const balances = mergeBalanceSources(sodexBalances, sodexAccountState);
  // Stablecoin / vault quote peg — not invented market prices
  for (const peg of ["USDC", "vUSDC", "USDT", "vUSDT"]) {
    if (prices[peg] === undefined) prices[peg] = 1;
  }
  // SoDEX lastPx for vault coins (primary when SoSoValue snapshot is down)
  try {
    const { createSodexClient } = await import("../clients/sodex.js");
    const { resolveProfile } = await import("../config/environment.js");
    const { getEnv } = await import("../config/env.js");
    const sodex = createSodexClient(
      resolveProfile(profileId ?? getEnv().HATCH_DEFAULT_PROFILE),
    );
    const tickers = await sodex.marketsTickers();
    const tickerPrices: Record<string, number> = {};
    supplementPricesFromSodexTickers(tickerPrices, tickers);
    for (const [symbol, price] of Object.entries(tickerPrices)) {
      if (prices[symbol] === undefined) prices[symbol] = price;
    }
  } catch (err) {
    diagnostics.push(
      `SoDEX ticker supplement failed: ${err instanceof Error ? err.message : String(err)}`,
    );
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
    warnings.push("No balances found in SoDEX account state/balances");
  }

  // Empty account is a real $0 portfolio — not "unavailable"
  const totalUsd =
    Object.keys(balances).length === 0 ? 0 : anyPriced ? total : null;

  return {
    totalUsd,
    components,
    source: officialPricesOk
      ? snapshotOk
        ? "sodex-asset-prices+sosovalue"
        : "sodex-asset-prices"
      : snapshotOk
        ? "sosovalue+sodex"
        : "sodex",
    valuationMethod: officialPricesOk
      ? "sodex_asset_price"
      : "sodex_last_trade",
    valuationScope: "spot_trading_value",
    pricedAt: new Date().toISOString(),
    warnings,
    diagnostics,
  };
}
