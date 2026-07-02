import { describe, expect, it } from "vitest";
import {
  extractBalances,
  resolvePriceUsd,
} from "../src/services/portfolioProjection.js";
import { snapshotMateriallyChanged } from "../src/services/snapshotPricing.js";

describe("portfolio snapshot pricing helpers", () => {
  it("extracts array and map balances", () => {
    const fromArr = extractBalances({
      data: {
        balances: [
          { coin: "vUSDC", available: "10.5" },
          { symbol: "vUSSI", balance: 2 },
        ],
      },
    });
    expect(fromArr.vUSDC).toBe(10.5);
    expect(fromArr.vUSSI).toBe(2);

    const fromMap = extractBalances({
      data: { balanceMap: { "vMAG7.ssi": "3.25" } },
    });
    expect(fromMap["vMAG7.ssi"]).toBe(3.25);
  });

  it("resolves USDC peg and MAG7 aliases", () => {
    expect(resolvePriceUsd("vUSDC", {})).toBe(1);
    expect(resolvePriceUsd("vMAG7.ssi", { "MAG7.ssi": 1.12 })).toBe(1.12);
    expect(resolvePriceUsd("vUSSI", { USSI: 0.99 })).toBe(0.99);
  });

  it("detects material USD delta", () => {
    expect(
      snapshotMateriallyChanged(
        { totalUsd: 100, rawBalancesJson: { a: 1 } },
        { totalUsd: 100.005, rawBalancesJson: { a: 1 } },
      ),
    ).toBe(false);
    expect(
      snapshotMateriallyChanged(
        { totalUsd: 100, rawBalancesJson: { a: 1 } },
        { totalUsd: 101, rawBalancesJson: { a: 1 } },
      ),
    ).toBe(true);
  });
});
