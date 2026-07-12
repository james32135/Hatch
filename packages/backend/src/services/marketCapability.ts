/**
 * Signed SoDEX execution capability — never inferred from dry reads alone.
 * Positive evidence: gateway + matcher acceptance (order history).
 * Fill evidence: trades + balance delta.
 * verifiedSafe stays false until explorer linkage is proven (GAP-5).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { redisGet, redisSet } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

export const INVEST_MODE = "LIMIT_IOC" as const;

/** Live relay / fresh probe positives (IMPLEMENTATION_PLAN). */
export const POSITIVE_TTL_SEC = 5 * 60;
/** Probe-seeded positives until the next signed probe refresh (GAP-6). */
export const PROBE_SEED_POSITIVE_TTL_SEC = 6 * 60 * 60;
/** Minimum negative cancel-only hold. */
export const NEGATIVE_TTL_SEC = 15 * 60;
/** Probe-seeded cancel-only (stable across full matrix). */
export const PROBE_SEED_NEGATIVE_TTL_SEC = 24 * 60 * 60;

export type SymbolCapability = {
  network: string;
  symbol: string;
  marketId: number;
  mode: typeof INVEST_MODE;
  metadataTrading: boolean;
  gatewayAccepted: boolean;
  matcherAccepted: boolean;
  canFill: boolean;
  fillProven: boolean;
  /** Always false until explorer wallet txs map to fills (GAP-5). */
  verifiedSafe: false;
  cancelOnly: boolean;
  reason: string | null;
  orderIDs: number[];
  tradeIDs: string[];
  observedAt: string;
  expiresAt: string;
  source: "probe" | "relay" | "seed";
};

export type CapabilityLabel =
  | "MATCHER_OK"
  | "FILL_OK"
  | "CANCEL_ONLY"
  | "UNVERIFIED"
  | "FAIL";

const memory = new Map<string, SymbolCapability>();
let seedAttempted = false;

function capKey(network: string, symbol: string): string {
  return `sodex:cap:${network}:${symbol.toUpperCase()}:${INVEST_MODE}`;
}

export function isCancelOnlyError(message: string | null | undefined): boolean {
  return /cancel[_\s-]?only/i.test(String(message || ""));
}

function isFresh(cap: SymbolCapability, now = Date.now()): boolean {
  return new Date(cap.expiresAt).getTime() > now;
}

async function readStore(key: string): Promise<SymbolCapability | null> {
  const mem = memory.get(key);
  if (mem && isFresh(mem)) return mem;
  try {
    const raw = await redisGet(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SymbolCapability;
    if (!isFresh(parsed)) {
      memory.delete(key);
      return null;
    }
    memory.set(key, parsed);
    return parsed;
  } catch (err) {
    logger.warn({ err: String(err), key }, "capability redis read failed");
    return mem && isFresh(mem) ? mem : null;
  }
}

async function writeStore(
  cap: SymbolCapability,
  ttlSec: number,
): Promise<void> {
  const key = capKey(cap.network, cap.symbol);
  memory.set(key, cap);
  try {
    await redisSet(key, JSON.stringify(cap), Math.max(1, ttlSec));
  } catch (err) {
    logger.warn({ err: String(err), key }, "capability redis write failed");
  }
}

export function capabilityLabel(cap: SymbolCapability | null): CapabilityLabel {
  if (!cap || !isFresh(cap)) return "UNVERIFIED";
  if (cap.cancelOnly) return "CANCEL_ONLY";
  if (cap.fillProven && cap.matcherAccepted) return "FILL_OK";
  if (cap.matcherAccepted && cap.gatewayAccepted) return "MATCHER_OK";
  return "UNVERIFIED";
}

export function isMatcherCapable(cap: SymbolCapability | null): boolean {
  if (!cap || !isFresh(cap) || cap.cancelOnly) return false;
  return cap.matcherAccepted && cap.gatewayAccepted;
}

export async function getSymbolCapability(input: {
  network: string;
  symbol: string;
}): Promise<SymbolCapability | null> {
  await ensureProbeSeeded(input.network);
  return readStore(capKey(input.network, input.symbol));
}

export async function recordCancelOnly(input: {
  network: string;
  symbol: string;
  marketId?: number;
  reason: string;
  source?: SymbolCapability["source"];
  ttlSec?: number;
}): Promise<SymbolCapability> {
  const ttl = input.ttlSec ?? NEGATIVE_TTL_SEC;
  const now = new Date();
  const cap: SymbolCapability = {
    network: input.network,
    symbol: input.symbol,
    marketId: input.marketId ?? 0,
    mode: INVEST_MODE,
    metadataTrading: true,
    gatewayAccepted: false,
    matcherAccepted: false,
    canFill: false,
    fillProven: false,
    verifiedSafe: false,
    cancelOnly: true,
    reason: input.reason,
    orderIDs: [],
    tradeIDs: [],
    observedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
    source: input.source ?? "relay",
  };
  await writeStore(cap, ttl);
  return cap;
}

export async function recordMatcherAccepted(input: {
  network: string;
  symbol: string;
  marketId?: number;
  orderID?: number | null;
  tradeIDs?: string[];
  fillProven?: boolean;
  reason?: string | null;
  source?: SymbolCapability["source"];
  ttlSec?: number;
}): Promise<SymbolCapability> {
  const ttl = input.ttlSec ?? POSITIVE_TTL_SEC;
  const now = new Date();
  const tradeIDs = input.tradeIDs ?? [];
  const fillProven = !!input.fillProven && tradeIDs.length > 0;
  const cap: SymbolCapability = {
    network: input.network,
    symbol: input.symbol,
    marketId: input.marketId ?? 0,
    mode: INVEST_MODE,
    metadataTrading: true,
    gatewayAccepted: true,
    matcherAccepted: true,
    canFill: fillProven || tradeIDs.length > 0,
    fillProven,
    verifiedSafe: false,
    cancelOnly: false,
    reason: input.reason ?? null,
    orderIDs: input.orderID ? [input.orderID] : [],
    tradeIDs,
    observedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl * 1000).toISOString(),
    source: input.source ?? "relay",
  };
  await writeStore(cap, ttl);
  return cap;
}

type ProbeOutcome = {
  case?: { kind?: string; notionalUsd?: number };
  gatewayAccepted?: boolean;
  matcherAccepted?: boolean;
  gatewayError?: string | null;
  orderID?: number | null;
  tradeIDs?: string[];
  balanceIncreased?: boolean | null;
  executedQty?: string | null;
  reason?: string | null;
};

type ProbeMarket = {
  symbol?: string;
  internalId?: number;
  status?: string;
  outcomes?: ProbeOutcome[];
};

function summarizeProbeMarket(
  network: string,
  market: ProbeMarket,
): SymbolCapability | null {
  const symbol = String(market.symbol || "");
  if (!symbol) return null;
  const outcomes = Array.isArray(market.outcomes) ? market.outcomes : [];
  const limitIoc = outcomes.filter((o) => o.case?.kind === "LIMIT_IOC");
  const cancelHit = outcomes.find((o) =>
    isCancelOnlyError(o.gatewayError || o.reason || ""),
  );
  if (cancelHit) {
    const now = new Date();
    return {
      network,
      symbol,
      marketId: Number(market.internalId) || 0,
      mode: INVEST_MODE,
      metadataTrading: String(market.status || "").toUpperCase() === "TRADING",
      gatewayAccepted: false,
      matcherAccepted: false,
      canFill: false,
      fillProven: false,
      verifiedSafe: false,
      cancelOnly: true,
      reason: String(cancelHit.gatewayError || cancelHit.reason || "cancel only"),
      orderIDs: [],
      tradeIDs: [],
      observedAt: now.toISOString(),
      expiresAt: new Date(
        now.getTime() + PROBE_SEED_NEGATIVE_TTL_SEC * 1000,
      ).toISOString(),
      source: "probe",
    };
  }

  const accepted = limitIoc.filter((o) => o.gatewayAccepted && o.matcherAccepted);
  if (accepted.length === 0) return null;

  const fillRows = accepted.filter(
    (o) =>
      (Array.isArray(o.tradeIDs) && o.tradeIDs.length > 0) ||
      o.balanceIncreased === true ||
      (o.executedQty != null && Number(o.executedQty) > 0),
  );
  const tradeIDs = [
    ...new Set(fillRows.flatMap((o) => (o.tradeIDs || []).map(String))),
  ];
  const orderIDs = accepted
    .map((o) => Number(o.orderID))
    .filter((n) => Number.isFinite(n) && n > 0);
  const now = new Date();
  const fillProven = fillRows.some((o) => o.balanceIncreased === true) && tradeIDs.length > 0;
  return {
    network,
    symbol,
    marketId: Number(market.internalId) || 0,
    mode: INVEST_MODE,
    metadataTrading: String(market.status || "").toUpperCase() === "TRADING",
    gatewayAccepted: true,
    matcherAccepted: true,
    canFill: fillRows.length > 0,
    fillProven,
    verifiedSafe: false,
    cancelOnly: false,
    reason: fillProven
      ? "probe LIMIT_IOC fill + balance"
      : "probe LIMIT_IOC matcher accepted",
    orderIDs,
    tradeIDs,
    observedAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + PROBE_SEED_POSITIVE_TTL_SEC * 1000,
    ).toISOString(),
    source: "probe",
  };
}

function probeFilePaths(): string[] {
  const cwd = process.cwd();
  return [
    resolve(cwd, "MARKET_PROBE_TESTNET.json"),
    resolve(cwd, "../../MARKET_PROBE_TESTNET.json"),
    resolve(cwd, "../MARKET_PROBE_TESTNET.json"),
    resolve(cwd, "packages/backend/../../MARKET_PROBE_TESTNET.json"),
  ];
}

export async function seedCapabilitiesFromProbeFile(
  network: string,
): Promise<number> {
  if (network !== "testnet") return 0;
  const path = probeFilePaths().find((p) => existsSync(p));
  if (!path) {
    logger.warn("MARKET_PROBE_TESTNET.json not found — no capability seed");
    return 0;
  }
  const probe = JSON.parse(readFileSync(path, "utf8")) as {
    network?: string;
    markets?: ProbeMarket[];
  };
  if (probe.network && probe.network !== "testnet") return 0;
  let written = 0;
  for (const market of probe.markets || []) {
    const cap = summarizeProbeMarket("testnet", market);
    if (!cap) continue;
    const ttl = cap.cancelOnly
      ? PROBE_SEED_NEGATIVE_TTL_SEC
      : PROBE_SEED_POSITIVE_TTL_SEC;
    await writeStore(cap, ttl);
    written += 1;
  }
  logger.info({ path, written }, "seeded SoDEX capabilities from probe");
  return written;
}

async function ensureProbeSeeded(network: string): Promise<void> {
  if (seedAttempted || network !== "testnet") return;
  seedAttempted = true;
  try {
    await seedCapabilitiesFromProbeFile(network);
  } catch (err) {
    logger.warn({ err: String(err) }, "capability probe seed failed");
  }
}

/** Force re-seed (probe script / tests). */
export async function reloadCapabilitiesFromProbe(
  network: string,
): Promise<number> {
  seedAttempted = false;
  memory.clear();
  seedAttempted = true;
  return seedCapabilitiesFromProbeFile(network);
}
