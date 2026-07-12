/** Portfolio display helpers. Never invent balances. Prefer live SoDEX+SoSoValue only. */

export type PortfolioFreshness = {
  live: boolean;
  source: "live" | "snapshot" | "unavailable";
  pricedAt: string | null;
  snapshotAt: string | null;
  sodexError: string | null;
  /** True only when index/SSI-related pricing warnings exist — not a protocol wait. */
  waitingSsi: boolean;
  /** True when holdings exist but lack USD prices. */
  waitingPricing: boolean;
  waitingReason: string | null;
  sharedAccount: boolean;
};

function finiteNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Live USD only — never snapshot fallback. */
export function resolveLivePortfolioUsd(p: any): number | null {
  if (!p) return null;
  if (p.sodexError && !p.projection) return null;
  for (const c of [
    p.familySpotTotalUsd,
    p.projection?.totalUsd,
    p.liveTotalUsd,
  ]) {
    const n = finiteNum(c);
    if (n != null) return n;
  }
  if (p.projection != null) {
    const n = finiteNum(p.totalUsd);
    if (n != null) return n;
  }
  return null;
}

/** Last known snapshot only — must be labeled as not live in UI. */
export function resolveSnapshotPortfolioUsd(p: any): number | null {
  if (!p?.latestSnapshot) return null;
  return finiteNum(p.latestSnapshot.totalUsd);
}

/**
 * Prefer live; expose whether UI must warn.
 * Does NOT silently promote snapshot to live.
 */
export function resolvePortfolioUsd(p: any): number | null {
  return resolveLivePortfolioUsd(p) ?? null;
}

export function portfolioWaitingCopy(p: any): { title: string; detail: string } {
  const fresh = portfolioFreshness(p);
  if (p?.sodexError) {
    return {
      title: "Live SoDEX read unavailable",
      detail: "We could not refresh balances right now. We will not invent a number.",
    };
  }
  if (fresh.waitingPricing) {
    return {
      title: "Waiting for live prices",
      detail: "Holdings are on SoDEX but some assets are not priced yet.",
    };
  }
  if (fresh.source === "snapshot") {
    return {
      title: "Last known value · not live",
      detail: "Showing the latest snapshot until a live SoDEX read succeeds.",
    };
  }
  return {
    title: "No live portfolio yet",
    detail: "After the first filled order, live balances appear here.",
  };
}

export function portfolioFreshness(p: any): PortfolioFreshness {
  const liveUsd = resolveLivePortfolioUsd(p);
  const snapUsd = resolveSnapshotPortfolioUsd(p);
  const warnings: string[] = p?.warnings || p?.projection?.warnings || [];
  const waitingSsi = warnings.some((w) => /ssi|index|confirm/i.test(String(w)));
  const waitingPricing = warnings.some((w) => /no live usd price/i.test(String(w)));
  const pricedAt = p?.projection?.pricedAt ? String(p.projection.pricedAt) : null;
  const snapshotAt = p?.latestSnapshot?.createdAt
    ? String(p.latestSnapshot.createdAt)
    : null;
  const waitingReason =
    p?.freshness?.waitingReason != null
      ? String(p.freshness.waitingReason)
      : liveUsd != null
        ? null
        : p?.sodexError
          ? "sodex_read_failed"
          : waitingPricing
            ? "holdings_unpriced"
            : snapUsd != null
              ? "snapshot_only"
              : "no_balances";

  if (liveUsd != null) {
    return {
      live: true,
      source: "live",
      pricedAt,
      snapshotAt,
      sodexError: p?.sodexError ? String(p.sodexError) : null,
      waitingSsi,
      waitingPricing,
      waitingReason: waitingSsi || waitingPricing ? waitingReason : null,
      sharedAccount: true,
    };
  }
  if (snapUsd != null) {
    return {
      live: false,
      source: "snapshot",
      pricedAt,
      snapshotAt,
      sodexError: p?.sodexError ? String(p.sodexError) : null,
      waitingSsi,
      waitingPricing: waitingPricing || !!p?.sodexError,
      waitingReason,
      sharedAccount: true,
    };
  }
  return {
    live: false,
    source: "unavailable",
    pricedAt,
    snapshotAt,
    sodexError: p?.sodexError ? String(p.sodexError) : null,
    waitingSsi: false,
    waitingPricing: true,
    waitingReason,
    sharedAccount: true,
  };
}

/** Signed order notional in USD. Never treat raw quantity as dollars. */
export function orderNotionalUsd(o: {
  quantity?: string | number | null;
  price?: string | number | null;
  notionalUsd?: number | null;
  amountUsd?: number | null;
}): number | null {
  const direct = finiteNum(o.notionalUsd) ?? finiteNum(o.amountUsd);
  if (direct != null) return direct;
  const q = finiteNum(o.quantity);
  const p = finiteNum(o.price);
  if (q != null && p != null && p > 0) return q * p;
  return null;
}

/** Build pie slices from allocation object — skip null/NaN so we don't show a zero pie. */
export function allocationSlices(
  allocation: Record<string, number | null | undefined> | null | undefined,
): Array<{ name: string; value: number }> {
  if (!allocation || typeof allocation !== "object") return [];
  const slices = Object.entries(allocation)
    .map(([name, v]) => ({ name, value: Number(v) }))
    .filter((s) => Number.isFinite(s.value) && s.value > 0);
  return slices;
}

/** Prefer holdings-derived allocation when total > 0 and pct map is empty/null. */
export function holdingsAllocation(
  holdings: Array<{ symbol?: string; valueUsd?: number | null; allocationPct?: number | null }> | undefined,
): Array<{ name: string; value: number }> {
  if (!holdings?.length) return [];
  const fromPct = holdings
    .map((h) => ({
      name: h.symbol || "?",
      value: h.allocationPct != null ? Number(h.allocationPct) : NaN,
    }))
    .filter((s) => Number.isFinite(s.value) && s.value > 0);
  if (fromPct.length) return fromPct;

  const total = holdings.reduce((s, h) => s + (Number(h.valueUsd) || 0), 0);
  if (total <= 0) return [];
  return holdings
    .map((h) => ({
      name: h.symbol || "?",
      value: ((Number(h.valueUsd) || 0) / total) * 100,
    }))
    .filter((s) => s.value > 0);
}
