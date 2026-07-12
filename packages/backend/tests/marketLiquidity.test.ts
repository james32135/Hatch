import { describe, expect, it } from "vitest";
import {
  preferredSymbolOrder,
  selectExecutionRoute,
  type MarketSnapshot,
} from "../src/services/marketLiquidity.js";
import type { SpotSymbolMeta } from "../src/services/sodexSymbols.js";
import type { HatchProfile } from "../src/config/environment.js";

const profile = {
  id: "testnet",
  chainId: 1,
  writesAllowed: true,
  sodexSpotRest: "",
  sodexSpotWs: "",
  sodexAppUrl: "",
  valuechainRpc: "",
  valuechainExplorer: "",
} as HatchProfile;

function snap(
  partial: Partial<MarketSnapshot> & { symbol: string; marketId: number },
): MarketSnapshot {
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
    lastPrice: partial.bestAsk ?? 0.4,
    midPrice: partial.bestAsk ?? 0.4,
    bestBid: partial.bestBid ?? 0.4,
    bestAsk: partial.bestAsk ?? null,
    spread: null,
    spreadPct: partial.spreadPct ?? 0.01,
    bidDepthLevels: partial.bidDepthLevels ?? 2,
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
    supportsMarket: false,
    liquidityScore: partial.score ?? 10,
    executionScore: partial.score ?? 10,
    score: partial.score ?? 10,
    expectedSlippageBps: 10,
    estimatedFillProbability: partial.executable ? 0.9 : 0,
    executable: partial.executable ?? false,
    rejectReasons: partial.rejectReasons ?? ["empty_asks"],
    unavailableReason: partial.executable ? null : "Empty orderbook (asks)",
    meta,
    ...partial,
  } as MarketSnapshot;
}

describe("selectExecutionRoute", () => {
  it("picks highest score with no preferred-symbol bias", () => {
    const markets = [
      snap({
        symbol: "vMAG7ssi_vUSDC",
        marketId: 3,
        bestAsk: 0.45,
        bestBid: 0.449,
        askDepthLevels: 4,
        bidDepthLevels: 4,
        askDepthUsd: 600,
        executable: true,
        rejectReasons: [],
        score: 80,
      }),
      snap({
        symbol: "WSOSO_vUSDC",
        marketId: 4,
        bestAsk: 0.45,
        bestBid: 0.449,
        askDepthLevels: 4,
        bidDepthLevels: 4,
        askDepthUsd: 900,
        executable: true,
        rejectReasons: [],
        score: 90,
      }),
    ];
    const route = selectExecutionRoute({
      notionalUsd: 6,
      maxSlippageBps: 50,
      markets,
      profile,
    });
    expect(route.market.symbol).toBe("WSOSO_vUSDC");
    expect(route.limitPrice).toBe("0.4523");
  });

  it("honors parent-chosen market when executable", () => {
    const markets = [
      snap({
        symbol: "vBTC_vUSDC",
        marketId: 1,
        bestAsk: 64000,
        bestBid: 63990,
        askDepthLevels: 4,
        bidDepthLevels: 4,
        askDepthUsd: 2000,
        executable: true,
        rejectReasons: [],
        score: 95,
      }),
      snap({
        symbol: "WSOSO_vUSDC",
        marketId: 4,
        bestAsk: 0.45,
        bestBid: 0.449,
        askDepthLevels: 4,
        bidDepthLevels: 4,
        askDepthUsd: 500,
        executable: true,
        rejectReasons: [],
        score: 70,
      }),
    ];
    const route = selectExecutionRoute({
      notionalUsd: 6,
      maxSlippageBps: 50,
      markets,
      profile,
      chosenSymbol: "WSOSO_vUSDC",
    });
    expect(route.market.symbol).toBe("WSOSO_vUSDC");
    expect(route.why).toMatch(/Parent selected/i);
  });

  it("rejects chosen market with empty asks", () => {
    expect(() =>
      selectExecutionRoute({
        notionalUsd: 6,
        maxSlippageBps: 50,
        markets: [
          snap({
            symbol: "vMAG7ssi_vUSDC",
            marketId: 3,
            bestAsk: null,
            askDepthLevels: 0,
            askDepthUsd: 0,
            executable: false,
            rejectReasons: ["empty_asks"],
          }),
        ],
        profile,
        chosenSymbol: "vMAG7ssi_vUSDC",
      }),
    ).toThrow(/not executable/i);
  });

  it("throws when nothing is executable", () => {
    expect(() =>
      selectExecutionRoute({
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
        profile,
      }),
    ).toThrow(/No executable/);
  });

  it("preferredSymbolOrder is empty (no hardcoded preference)", () => {
    expect(preferredSymbolOrder("BALANCED")).toEqual([]);
  });
});
