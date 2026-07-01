/**
 * Map SoDEX balances + SoSoValue prices into PortfolioSnapshot columns.
 * Never invents prices — USDC/vUSDC pegged at 1 only.
 */
import {
  extractBalances,
  projectPortfolioUsd,
  type PortfolioProjection,
} from "./portfolioProjection.js";

const MAG7_KEYS = [
  "vMAG7.ssi",
  "vMAG7ssi",
  "VMAG7.SSI",
  "MAG7.ssi",
  "vsMAG7",
];
const USSI_KEYS = ["vUSSI", "VUSSI", "USSI"];
const SMAG7_KEYS = ["sMAG7.ssi", "sMAG7", "SMAG7.SSI"];

function pickQty(
  balances: Record<string, number>,
  keys: string[],
): number | null {
  for (const k of keys) {
    if (balances[k] !== undefined) return balances[k];
    const hit = Object.entries(balances).find(
      ([sym]) => sym.toLowerCase() === k.toLowerCase(),
    );
    if (hit) return hit[1];
  }
  return null;
}

export interface SnapshotPricing {
  totalUsd: number | null;
  mag7Qty: number | null;
  ussiQty: number | null;
  smag7Qty: number | null;
  projection: PortfolioProjection;
}

export async function priceAccountState(
  sodexAccountState: unknown,
): Promise<SnapshotPricing> {
  const balances = extractBalances(sodexAccountState);
  const projection = await projectPortfolioUsd(sodexAccountState);
  return {
    totalUsd: projection.totalUsd,
    mag7Qty: pickQty(balances, MAG7_KEYS),
    ussiQty: pickQty(balances, USSI_KEYS),
    smag7Qty: pickQty(balances, SMAG7_KEYS),
    projection,
  };
}

/** Meaningful delta for education trigger — prefer priced USD, else raw JSON */
export function snapshotMateriallyChanged(
  prev: {
    totalUsd?: { toString(): string } | number | null;
    rawBalancesJson: unknown;
  } | null,
  next: { totalUsd: number | null; rawBalancesJson: unknown },
): boolean {
  if (!prev) return false;
  const prevUsd =
    prev.totalUsd === null || prev.totalUsd === undefined
      ? null
      : Number(prev.totalUsd.toString());
  if (
    prevUsd !== null &&
    next.totalUsd !== null &&
    Number.isFinite(prevUsd) &&
    Number.isFinite(next.totalUsd)
  ) {
    const delta = Math.abs(next.totalUsd - prevUsd);
    // ≥ $0.01 or ≥ 0.5% move
    if (delta >= 0.01) return true;
    if (prevUsd !== 0 && delta / Math.abs(prevUsd) >= 0.005) return true;
    return false;
  }
  return (
    JSON.stringify(prev.rawBalancesJson) !== JSON.stringify(next.rawBalancesJson)
  );
}
