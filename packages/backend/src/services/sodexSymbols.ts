/**
 * Resolve SoDEX spot symbols from the live markets/symbols API.
 * Never hardcode testnet IDs from mainnet — they differ (e.g. vUSSI 24 vs 26).
 * Official: GET ${SPOT_ENDPOINT}/markets/symbols
 * Source: https://sodex.com/documentation/trading-api/rest-v1/sodex-rest-spot-api
 */
import type { HatchProfile } from "../config/environment.js";
import { createSodexClient } from "../clients/sodex.js";
import { HatchError } from "../lib/errors.js";
import { redisGet, redisSet } from "../lib/redis.js";

export type SpotSymbolMeta = {
  id: number;
  name: string;
  baseCoin: string;
  minNotional: number;
  minQuantity: number;
  stepSize: number;
  quantityPrecision: number;
  /** Live tick size from markets/symbols (SoDEX rejects padded price strings). */
  tickSize: number;
  pricePrecision: number;
  status: string;
};

export type HatchIndexSymbols = {
  mag7: SpotSymbolMeta;
  ussi: SpotSymbolMeta;
  network: "mainnet" | "testnet";
  pricedAt: string;
};

function asNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseSymbol(row: Record<string, unknown>): SpotSymbolMeta | null {
  const id = asNum(row.id ?? row.symbolID ?? row.symbolId);
  const name = String(row.name ?? row.symbol ?? "");
  if (!id || !name) return null;
  const pricePrecision = asNum(row.pricePrecision, 4);
  const tickFromApi = asNum(row.tickSize);
  return {
    id,
    name,
    baseCoin: String(row.baseCoin ?? row.base ?? ""),
    minNotional: asNum(row.minNotional, 5),
    minQuantity: asNum(row.minQuantity ?? row.marketMinQuantity, 0.01),
    stepSize: asNum(row.stepSize, 0.01),
    quantityPrecision: asNum(row.quantityPrecision, 2),
    pricePrecision,
    tickSize: tickFromApi > 0 ? tickFromApi : Math.pow(10, -Math.max(0, pricePrecision)),
    status: String(row.status ?? "UNKNOWN"),
  };
}

/** Match SoDEX decimal formatting — strip trailing zeros (SoDEX rejects "0.4500"). */
export function formatDecimal(
  value: number,
  stepOrPrecision: number,
  mode: "round" | "floor" = "round",
): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  // Tick/step sizes are always positive steps. Integers >= 1 (e.g. BTC tick=1) are
  // steps, not decimal-precision counts — treating them as precision yields 0.1.
  const step =
    stepOrPrecision > 0 && stepOrPrecision < 1
      ? stepOrPrecision
      : stepOrPrecision >= 1
        ? stepOrPrecision
        : Math.pow(10, -Math.max(0, stepOrPrecision));
  const scaled =
    mode === "floor" ? Math.floor(value / step) * step : Math.round(value / step) * step;
  const decimals = step < 1 ? Math.max(0, Math.ceil(-Math.log10(step) - 1e-12)) : 0;
  return scaled.toFixed(decimals).replace(/\.?0+$/, "") || "0";
}

export function getTickSize(meta: SpotSymbolMeta): number {
  if (meta.tickSize > 0) return meta.tickSize;
  const pp = meta.pricePrecision >= 0 ? meta.pricePrecision : 2;
  return Math.pow(10, -pp);
}

export function getStepSize(meta: SpotSymbolMeta): number {
  if (meta.stepSize > 0) return meta.stepSize;
  const qp = meta.quantityPrecision >= 0 ? meta.quantityPrecision : 2;
  return Math.pow(10, -qp);
}

/** SoDEX-accepted price string (tick-aligned, no padded decimals). */
export function formatPrice(value: number, meta: SpotSymbolMeta): string {
  return formatDecimal(value, getTickSize(meta));
}

/** SoDEX-accepted quantity string (step-aligned, floor, no padded decimals). */
export function formatQuantity(value: number, meta: SpotSymbolMeta): string {
  return formatDecimal(value, getStepSize(meta), "floor");
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

export async function resolveHatchIndexSymbols(
  profile: HatchProfile,
): Promise<HatchIndexSymbols> {
  const network = profile.id === "mainnet" || profile.id === "mainnet-readonly"
    ? "mainnet"
    : "testnet";
  const cacheKey = `sodex:symbols:hatch-index:${network}`;
  const hit = await redisGet(cacheKey);
  if (hit) {
    try {
      return JSON.parse(hit) as HatchIndexSymbols;
    } catch {
      /* refresh */
    }
  }

  const client = createSodexClient(profile);
  const raw = await client.marketsSymbols();
  const list = unwrapList(raw);
  const parsed = list.map(parseSymbol).filter(Boolean) as SpotSymbolMeta[];

  const mag7 = parsed.find((s) => s.name === "vMAG7ssi_vUSDC");
  const ussi = parsed.find((s) => s.name === "vUSSI_vUSDC");
  if (!mag7 || !ussi) {
    throw new HatchError(
      "unavailable",
      `SoDEX ${network} symbols missing vMAG7ssi_vUSDC or vUSSI_vUSDC (live markets/symbols)`,
      502,
    );
  }
  if (mag7.status !== "TRADING" || ussi.status !== "TRADING") {
    throw new HatchError(
      "unavailable",
      `SoDEX index market not TRADING (MAG7=${mag7.status}, USSI=${ussi.status})`,
      503,
    );
  }

  const out: HatchIndexSymbols = {
    mag7,
    ussi,
    network,
    pricedAt: new Date().toISOString(),
  };
  await redisSet(cacheKey, JSON.stringify(out), 120);
  return out;
}

/** Mid / last from live tickers — official GET /markets/tickers */
export async function resolveMidsFromTickers(
  profile: HatchProfile,
  symbols: string[],
): Promise<Record<string, string>> {
  const client = createSodexClient(profile);
  const raw = await client.marketsTickers();
  const list = unwrapList(raw);
  const out: Record<string, string> = {};
  for (const row of list) {
    const name = String(row.symbol ?? row.name ?? "");
    if (!symbols.includes(name)) continue;
    const px =
      asNum(row.lastPx) ||
      asNum(row.bidPx) ||
      asNum(row.askPx) ||
      asNum(row.vwap) ||
      asNum(row.price);
    if (px > 0) out[name] = String(px);
  }
  return out;
}

/**
 * Round qty down to stepSize so SoDEX accepts the order (reference formatQuantity).
 */
export function quantizeQty(qty: number, meta: SpotSymbolMeta): string {
  const stepped = Number(formatQuantity(qty, meta));
  if (stepped < meta.minQuantity) {
    throw new HatchError(
      "notional_too_small",
      `Quantity ${stepped} below SoDEX minQuantity ${meta.minQuantity} for ${meta.name}`,
      400,
    );
  }
  return formatQuantity(qty, meta);
}
