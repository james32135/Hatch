/**
 * Portfolio engine — holdings, cost basis / P/L, history, txns, staking state.
 * Prices never invented; cost basis from snapshot history + allowance totals (best-effort).
 */
import { createPublicClient, http, type Address } from "viem";
import { base } from "viem/chains";
import { getPrisma } from "../lib/prisma.js";
import { BASE, TOKENS } from "../config/addresses.js";
import {
  extractBalances,
  projectPortfolioUsd,
  type PortfolioProjection,
} from "./portfolioProjection.js";

const erc20BalanceOfAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export interface HoldingRow {
  symbol: string;
  qty: number | null;
  priceUsd: number | null;
  valueUsd: number | null;
  allocationPct: number | null;
}

export interface PortfolioPerformance {
  currentUsd: number | null;
  costBasisUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
  costBasisSource: "none";
}

export interface HistoryPoint {
  at: string;
  totalUsd: number | null;
  mag7Qty: number | null;
  ussiQty: number | null;
  smag7Qty: number | null;
}

export function buildHoldings(
  projection: PortfolioProjection | null,
): HoldingRow[] {
  if (!projection?.components.length) return [];
  const total = projection.totalUsd;
  return projection.components.map((c) => ({
    symbol: c.symbol,
    qty: c.qty,
    priceUsd: c.priceUsd,
    valueUsd: c.valueUsd,
    allocationPct:
      total && total > 0 && c.valueUsd !== null
        ? (c.valueUsd / total) * 100
        : null,
  }));
}

export function snapshotsToHistory(
  rows: Array<{
    createdAt: Date;
    totalUsd: { toString(): string } | number | null;
    mag7Qty: { toString(): string } | number | null;
    ussiQty: { toString(): string } | number | null;
    smag7Qty: { toString(): string } | number | null;
  }>,
): HistoryPoint[] {
  return rows.map((r) => ({
    at: r.createdAt.toISOString(),
    totalUsd:
      r.totalUsd === null || r.totalUsd === undefined
        ? null
        : Number(r.totalUsd.toString()),
    mag7Qty:
      r.mag7Qty === null || r.mag7Qty === undefined
        ? null
        : Number(r.mag7Qty.toString()),
    ussiQty:
      r.ussiQty === null || r.ussiQty === undefined
        ? null
        : Number(r.ussiQty.toString()),
    smag7Qty:
      r.smag7Qty === null || r.smag7Qty === undefined
        ? null
        : Number(r.smag7Qty.toString()),
  }));
}

export async function readBaseStakingState(wallet: string): Promise<{
  chainId: number;
  mag7Ssi: string;
  sMag7Ssi: string;
  ussi: string;
  defiSsi: string;
  memeSsi: string;
  note: string;
} | null> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) return null;
  const client = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL ?? BASE.rpcUrl),
  });
  const addr = wallet as Address;
  const [mag7, smag7, ussi, defi, meme] = await Promise.all([
    client.readContract({
      address: TOKENS.mag7Ssi,
      abi: erc20BalanceOfAbi,
      functionName: "balanceOf",
      args: [addr],
    }),
    client.readContract({
      address: TOKENS.sMag7Ssi,
      abi: erc20BalanceOfAbi,
      functionName: "balanceOf",
      args: [addr],
    }),
    client.readContract({
      address: TOKENS.ussi,
      abi: erc20BalanceOfAbi,
      functionName: "balanceOf",
      args: [addr],
    }),
    client.readContract({
      address: TOKENS.defiSsi,
      abi: erc20BalanceOfAbi,
      functionName: "balanceOf",
      args: [addr],
    }),
    client.readContract({
      address: TOKENS.memeSsi,
      abi: erc20BalanceOfAbi,
      functionName: "balanceOf",
      args: [addr],
    }),
  ]);
  return {
    chainId: BASE.chainId,
    mag7Ssi: mag7.toString(),
    sMag7Ssi: smag7.toString(),
    ussi: ussi.toString(),
    defiSsi: defi.toString(),
    memeSsi: meme.toString(),
    note: "sMAG7.ssi > 0 indicates staked receipt on Base (SSI Earn). Path B mint is WLP-only; parents use Path A.",
  };
}

export async function buildPortfolioEngineView(input: {
  childId: string;
  parentId: string;
  parentWallet: string;
  accountState: unknown | null;
  accountBalances?: unknown | null;
  profileId?: string | null;
}): Promise<{
  holdings: HoldingRow[];
  performance: PortfolioPerformance;
  history: HistoryPoint[];
  transactions: unknown[];
  staking: Awaited<ReturnType<typeof readBaseStakingState>>;
  allocation: { mag7Pct: number | null; ussiPct: number | null; otherPct: number | null };
  projection: PortfolioProjection | null;
}> {
  const prisma = getPrisma();
  let projection: PortfolioProjection | null = null;
  if (input.accountState || input.accountBalances) {
    try {
      projection = await projectPortfolioUsd(
        input.accountState,
        input.accountBalances,
        input.profileId,
      );
    } catch {
      projection = null;
    }
  }

  const holdings = buildHoldings(projection);
  const snapshots = await prisma.portfolioSnapshot.findMany({
    where: { childId: input.childId },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  // Live balances are the parent's shared SoDEX spot account. A child-specific
  // cost basis/PnL cannot be derived from child allowance settings or snapshots,
  // because neither is a segregated allocation ledger.
  const performance: PortfolioPerformance = {
    currentUsd: projection?.totalUsd ?? null,
    costBasisUsd: null,
    pnlUsd: null,
    pnlPct: null,
    costBasisSource: "none",
  };

  const history = snapshotsToHistory(snapshots);

  const transactions = await prisma.signedOrder.findMany({
    // Order attribution is child-specific; resulting assets remain in the
    // parent's shared account and are not proof of child ownership.
    where: { childId: input.childId, parentId: input.parentId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      clOrdId: true,
      symbolName: true,
      side: true,
      quantity: true,
      price: true,
      status: true,
      environment: true,
      createdAt: true,
      error: true,
    },
  });

  let staking = null;
  try {
    staking = await readBaseStakingState(input.parentWallet);
  } catch {
    staking = null;
  }

  const mag7Val = holdings
    .filter((h) => /mag7/i.test(h.symbol))
    .reduce((s, h) => s + (h.valueUsd ?? 0), 0);
  const ussiVal = holdings
    .filter((h) => /ussi/i.test(h.symbol))
    .reduce((s, h) => s + (h.valueUsd ?? 0), 0);
  const total = projection?.totalUsd;
  const allocation = {
    mag7Pct: total && total > 0 ? (mag7Val / total) * 100 : null,
    ussiPct: total && total > 0 ? (ussiVal / total) * 100 : null,
    otherPct:
      total && total > 0
        ? ((total - mag7Val - ussiVal) / total) * 100
        : null,
  };

  return {
    holdings,
    performance,
    history,
    transactions,
    staking,
    allocation,
    projection,
  };
}

/** Exported for tests — balance map from raw SoDEX state */
export function holdingsFromState(state: unknown): Record<string, number> {
  return extractBalances(state);
}
