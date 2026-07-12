import { describe, expect, it } from "vitest";
import {
  extractBalances,
  extractSodexAssetPrices,
  mergeBalanceSources,
  resolvePriceUsd,
  supplementPricesFromSodexTickers,
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

  it("does not double-count state and balances payloads", () => {
    const state = {
      data: { B: [{ a: "vUSDC", t: "10" }, { a: "WSOSO", t: "5" }] },
    };
    const balances = {
      data: {
        balances: [
          { coin: "vUSDC", total: "10" },
          { coin: "WSOSO", total: "5" },
        ],
      },
    };
    const merged = mergeBalanceSources(balances, state);
    expect(merged.vUSDC).toBe(10);
    expect(merged.WSOSO).toBe(5);
  });

  it("resolves USDC peg and MAG7 aliases", () => {
    expect(resolvePriceUsd("vUSDC", {})).toBe(1);
    expect(resolvePriceUsd("vMAG7.ssi", { "MAG7.ssi": 1.12 })).toBe(1.12);
    expect(resolvePriceUsd("vUSSI", { USSI: 0.99 })).toBe(0.99);
  });

  it("supplements vault prices from SoDEX tickers", () => {
    const prices: Record<string, number> = { vUSDC: 1 };
    supplementPricesFromSodexTickers(prices, {
      data: [
        { symbol: "WSOSO_vUSDC", lastPx: "0.45" },
        { symbol: "vETH_vUSDC", lastPx: "2068.7" },
      ],
    });
    expect(resolvePriceUsd("WSOSO", prices)).toBe(0.45);
    expect(resolvePriceUsd("vETH", prices)).toBe(2068.7);
  });

  it("extracts the official SoDEX portfolio asset-price feed", () => {
    const prices = extractSodexAssetPrices({
      data: [
        { name: "vUSDC", price: "1" },
        { name: "WSOSO", price: "0.3076" },
        { name: "vBTC", price: "63792.44" },
      ],
    });
    expect(prices.vUSDC).toBe(1);
    expect(prices.WSOSO).toBe(0.3076);
    expect(prices.vBTC).toBe(63792.44);
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
