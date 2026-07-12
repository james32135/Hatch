/** Resolve live portfolio USD from API response shapes. Never invents values. */
export function resolvePortfolioUsd(p: any): number | null {
  if (!p) return null;
  const candidates = [
    p.performance?.currentUsd,
    p.projection?.totalUsd,
    p.totalUsd,
    p.latestSnapshot?.totalUsd,
  ];
  for (const c of candidates) {
    if (c === null || c === undefined) continue;
    const n = typeof c === "number" ? c : Number(c);
    if (Number.isFinite(n)) return n;
  }
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
