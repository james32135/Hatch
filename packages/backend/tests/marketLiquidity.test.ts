import { describe, expect, it } from "vitest";
import {
  preferredSymbolOrder,
  selectExecutionRoute,
  type MarketSnapshot,
} from "../src/services/marketLiquidity.js";
import type { SpotSymbolMeta } from "../src/services/sodexSymbols.js";

function snap(partial: Partial<MarketSnapshot> & { symbol: string; marketId: number }): MarketSnapshot {
  const meta: SpotSymbolMeta = {
    id: partial.marketId,
    name: partial.symbol,
    baseCoin: "x",
    minNotional: partial.minNotional ?? 5,
    minQuantity: 0.01,
    stepSize: 0.01,
    quantityPrecision: 2,
    tickSize: 0.0001,
    pricePrecision: 4,
    status: "TRADING",
  };
  return {
    symbol: partial.symbol,
    marketId: partial.marketId,
    base: "x",
    quote: "vUSDC",
    status: "TRADING",
    bestBid: partial.bestBid ?? 0.4,
    bestAsk: partial.bestAsk ?? null,
    spread: null,
    spreadPct: partial.spreadPct ?? 0.01,
    bidDepthLevels: 2,
    askDepthLevels: partial.askDepthLevels ?? 0,
    bidDepthQty: 10,
    askDepthQty: partial.askDepthQty ?? 0,
    askDepthUsd: partial.askDepthUsd ?? 0,
    bidDepthUsd: 10,
    volume24h: 100,
    quoteVolume24h: 100,
    minNotional: partial.minNotional ?? 5,
    tickSize: 0.0001,
    stepSize: 0.01,
    pricePrecision: 4,
    quantityPrecision: 2,
    supportsLimit: true,
    supportsIoc: true,
    supportsMarket: true,
    score: partial.score ?? 10,
    executable: partial.executable ?? false,
    rejectReasons: partial.rejectReasons ?? ["empty_asks"],
    meta,
    ...partial,
  } as MarketSnapshot;
}

describe("selectExecutionRoute", () => {
  it("prefers MAG7 when executable for BALANCED", () => {
    const markets = [
      snap({
        symbol: "vMAG7ssi_vUSDC",
        marketId: 3,
        bestAsk: 0.45,
        askDepthLevels: 4,
        askDepthUsd: 600,
        executable: true,
        rejectReasons: [],
        score: 80,
      }),
      snap({
        symbol: "WSOSO_vUSDC",
        marketId: 4,
        bestAsk: 0.45,
        askDepthLevels: 4,
        askDepthUsd: 900,
        executable: true,
        rejectReasons: [],
        score: 90,
      }),
    ];
    const route = selectExecutionRoute({
      riskTier: "BALANCED",
      notionalUsd: 6,
      maxSlippageBps: 50,
      markets,
    });
    expect(route.market.symbol).toBe("vMAG7ssi_vUSDC");
    expect(route.limitPrice).toBe("0.4523"); // 0.45 * 1.005
  });

  it("skips MAG7 with empty asks and routes to liquid market", () => {
    const markets = [
      snap({
        symbol: "vMAG7ssi_vUSDC",
        marketId: 3,
        bestAsk: null,
        askDepthLevels: 0,
        askDepthUsd: 0,
        executable: false,
        rejectReasons: ["empty_asks"],
        score: 0,
      }),
      snap({
        symbol: "WSOSO_vUSDC",
        marketId: 4,
        bestAsk: 0.45,
        askDepthLevels: 4,
        askDepthUsd: 500,
        executable: true,
        rejectReasons: [],
        score: 70,
      }),
    ];
    const route = selectExecutionRoute({
      riskTier: "BALANCED",
      notionalUsd: 6,
      maxSlippageBps: 50,
      markets,
    });
    expect(route.market.symbol).toBe("WSOSO_vUSDC");
    expect(route.why).toMatch(/No preferred Path A/i);
  });

  it("throws when nothing is executable", () => {
    expect(() =>
      selectExecutionRoute({
        riskTier: "BALANCED",
        notionalUsd: 6,
        maxSlippageBps: 50,
        markets: [
          snap({
            symbol: "vMAG7ssi_vUSDC",
            marketId: 3,
            executable: false,
            rejectReasons: ["empty_asks"],
          }),
        ],
      }),
    ).toThrow(/No executable/);
  });

  it("preferred order for BALANCED starts with MAG7", () => {
    expect(preferredSymbolOrder("BALANCED")[0]?.test("vMAG7ssi_vUSDC")).toBe(true);
  });
});
