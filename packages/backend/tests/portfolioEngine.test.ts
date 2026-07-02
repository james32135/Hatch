import { describe, expect, it } from "vitest";
import {
  buildHoldings,
  computePerformance,
  snapshotsToHistory,
} from "../src/services/portfolioEngine.js";
import type { PortfolioProjection } from "../src/services/portfolioProjection.js";

describe("portfolio engine", () => {
  it("builds holdings with allocation", () => {
    const projection: PortfolioProjection = {
      totalUsd: 100,
      components: [
        { symbol: "vMAG7.ssi", qty: 40, priceUsd: 1, valueUsd: 40 },
        { symbol: "vUSSI", qty: 60, priceUsd: 1, valueUsd: 60 },
      ],
      source: "sosovalue+sodex",
      pricedAt: new Date().toISOString(),
      warnings: [],
    };
    const h = buildHoldings(projection);
    expect(h).toHaveLength(2);
    expect(h[0]?.allocationPct).toBe(40);
    expect(h[1]?.allocationPct).toBe(60);
  });

  it("computes P/L from first snapshot cost basis", () => {
    const perf = computePerformance({
      currentUsd: 120,
      snapshots: [{ totalUsd: 100 }, { totalUsd: 110 }],
      allowanceSumUsd: 50,
    });
    expect(perf.costBasisSource).toBe("first_snapshot");
    expect(perf.costBasisUsd).toBe(100);
    expect(perf.pnlUsd).toBe(20);
    expect(perf.pnlPct).toBe(20);
  });

  it("falls back to allowance sum", () => {
    const perf = computePerformance({
      currentUsd: 80,
      snapshots: [{ totalUsd: null }],
      allowanceSumUsd: 70,
    });
    expect(perf.costBasisSource).toBe("allowance_sum");
    expect(perf.pnlUsd).toBe(10);
  });

  it("maps snapshot history", () => {
    const hist = snapshotsToHistory([
      {
        createdAt: new Date("2026-07-01T00:00:00Z"),
        totalUsd: 10,
        mag7Qty: 1,
        ussiQty: 2,
        smag7Qty: null,
      },
    ]);
    expect(hist[0]?.totalUsd).toBe(10);
    expect(hist[0]?.smag7Qty).toBeNull();
  });
});
