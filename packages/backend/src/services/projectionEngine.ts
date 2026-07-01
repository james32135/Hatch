/**
 * Growth projection engine — weekly/monthly allowance scenarios.
 * Yield assumptions are EXPLICIT inputs only — never invent APYs from thin air.
 * Default yield bands are labeled as assumptions, not market facts.
 */
export type Cadence = "weekly" | "monthly";

export interface ProjectionAssumptions {
  /** Annual yield as decimal, e.g. 0.05 = 5%. Must be provided or use documented band. */
  annualYield: number;
  years: number;
  startingUsd: number;
  allowanceUsd: number;
  cadence: Cadence;
  label?: string;
}

export interface ProjectionPoint {
  year: number;
  valueUsd: number;
  contributionsUsd: number;
}

export interface ProjectionResult {
  assumptions: ProjectionAssumptions;
  points: ProjectionPoint[];
  terminalUsd: number;
  totalContributionsUsd: number;
  growthFromYieldUsd: number;
  warnings: string[];
}

export interface SensitivityRow {
  annualYield: number;
  terminalUsd: number;
}

/** Documented assumption bands — NOT live yields. Callers must disclose. */
export const DOCUMENTED_YIELD_ASSUMPTION_BANDS = {
  conservative: 0.03,
  base: 0.05,
  optimistic: 0.08,
} as const;

export function allowancesPerYear(cadence: Cadence): number {
  return cadence === "weekly" ? 52 : 12;
}

export function validateAssumptions(a: ProjectionAssumptions): string[] {
  const warnings: string[] = [];
  if (!(a.years > 0 && a.years <= 25)) {
    warnings.push("years should be 1–25");
  }
  if (!(a.annualYield >= 0 && a.annualYield <= 0.25)) {
    warnings.push("annualYield outside 0–25% — unusual assumption");
  }
  if (!(a.allowanceUsd >= 0)) warnings.push("allowanceUsd must be >= 0");
  if (!(a.startingUsd >= 0)) warnings.push("startingUsd must be >= 0");
  return warnings;
}

/**
 * Compound annually with contributions at end of each year (simple transparent model).
 * contributionPerYear = allowance * periodsPerYear
 */
export function projectGrowth(a: ProjectionAssumptions): ProjectionResult {
  const warnings = [
    ...validateAssumptions(a),
    "Yield is an ASSUMPTION input — not a live SoSoValue/SSI APY quote",
  ];
  const contribPerYear = a.allowanceUsd * allowancesPerYear(a.cadence);
  const points: ProjectionPoint[] = [];
  let value = a.startingUsd;
  let contributions = 0;

  for (let y = 1; y <= a.years; y++) {
    value = value * (1 + a.annualYield) + contribPerYear;
    contributions += contribPerYear;
    points.push({
      year: y,
      valueUsd: round2(value),
      contributionsUsd: round2(contributions),
    });
  }

  const terminalUsd = round2(value);
  return {
    assumptions: a,
    points,
    terminalUsd,
    totalContributionsUsd: round2(contributions),
    growthFromYieldUsd: round2(terminalUsd - a.startingUsd - contributions),
    warnings,
  };
}

export function sensitivityAnalysis(input: {
  startingUsd: number;
  allowanceUsd: number;
  cadence: Cadence;
  years: number;
  yields?: number[];
}): SensitivityRow[] {
  const yields =
    input.yields ??
    Object.values(DOCUMENTED_YIELD_ASSUMPTION_BANDS);
  return yields.map((annualYield) => {
    const r = projectGrowth({
      ...input,
      annualYield,
    });
    return { annualYield, terminalUsd: r.terminalUsd };
  });
}

export function scenarioPack(input: {
  startingUsd: number;
  weeklyAllowanceUsd: number;
  monthlyAllowanceUsd: number;
  years: number;
}): {
  weekly: Record<string, ProjectionResult>;
  monthly: Record<string, ProjectionResult>;
  sensitivityWeekly: SensitivityRow[];
  note: string;
} {
  const weekly: Record<string, ProjectionResult> = {};
  const monthly: Record<string, ProjectionResult> = {};
  for (const [label, annualYield] of Object.entries(
    DOCUMENTED_YIELD_ASSUMPTION_BANDS,
  )) {
    weekly[label] = projectGrowth({
      startingUsd: input.startingUsd,
      allowanceUsd: input.weeklyAllowanceUsd,
      cadence: "weekly",
      years: input.years,
      annualYield,
      label,
    });
    monthly[label] = projectGrowth({
      startingUsd: input.startingUsd,
      allowanceUsd: input.monthlyAllowanceUsd,
      cadence: "monthly",
      years: input.years,
      annualYield,
      label,
    });
  }
  return {
    weekly,
    monthly,
    sensitivityWeekly: sensitivityAnalysis({
      startingUsd: input.startingUsd,
      allowanceUsd: input.weeklyAllowanceUsd,
      cadence: "weekly",
      years: input.years,
    }),
    note: "Assumption bands only — not live yields. Disclose to parents.",
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
