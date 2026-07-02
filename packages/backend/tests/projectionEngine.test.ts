import { describe, expect, it } from "vitest";
import {
  DOCUMENTED_YIELD_ASSUMPTION_BANDS,
  allowancesPerYear,
  projectGrowth,
  scenarioPack,
  sensitivityAnalysis,
  validateAssumptions,
} from "../src/services/projectionEngine.js";

describe("projectionEngine", () => {
  it("documents assumption bands (not live APYs)", () => {
    expect(DOCUMENTED_YIELD_ASSUMPTION_BANDS.conservative).toBe(0.03);
    expect(DOCUMENTED_YIELD_ASSUMPTION_BANDS.base).toBe(0.05);
    expect(DOCUMENTED_YIELD_ASSUMPTION_BANDS.optimistic).toBe(0.08);
  });

  it("projects weekly contributions with yield assumption", () => {
    const r = projectGrowth({
      startingUsd: 100,
      allowanceUsd: 10,
      cadence: "weekly",
      years: 2,
      annualYield: 0.05,
    });
    expect(allowancesPerYear("weekly")).toBe(52);
    expect(r.totalContributionsUsd).toBe(10 * 52 * 2);
    expect(r.terminalUsd).toBeGreaterThan(r.totalContributionsUsd);
    expect(r.warnings.some((w) => w.includes("ASSUMPTION"))).toBe(true);
    expect(r.points).toHaveLength(2);
  });

  it("runs sensitivity across documented bands", () => {
    const rows = sensitivityAnalysis({
      startingUsd: 0,
      allowanceUsd: 20,
      cadence: "monthly",
      years: 5,
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]!.terminalUsd).toBeLessThan(rows[2]!.terminalUsd);
  });

  it("builds weekly/monthly scenario pack", () => {
    const pack = scenarioPack({
      startingUsd: 50,
      weeklyAllowanceUsd: 5,
      monthlyAllowanceUsd: 20,
      years: 3,
    });
    expect(pack.weekly.base?.terminalUsd).toBeGreaterThan(0);
    expect(pack.monthly.base?.terminalUsd).toBeGreaterThan(0);
    expect(pack.note).toMatch(/Assumption/);
  });

  it("flags unusual assumptions", () => {
    const w = validateAssumptions({
      startingUsd: -1,
      allowanceUsd: 10,
      cadence: "weekly",
      years: 40,
      annualYield: 0.5,
    });
    expect(w.length).toBeGreaterThan(0);
  });
});
