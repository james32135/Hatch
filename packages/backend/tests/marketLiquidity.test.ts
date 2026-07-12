import { describe, expect, it } from "vitest";
import {
  preferredSymbolOrder,
  selectExecutionRoute,
  type MarketSnapshot,
} from "../src/services/marketLiquidity.js";
import {
  dryValidateBuyOrder,
  evaluateMarketEligibility,
} from "../src/services/marketEligibility.js";
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

function metaFor(symbol: string, id: number): SpotSymbolMeta {
  return {
    id,
    name: symbol,
    baseCoin: "x",
    minNotional: 5,
    minQuantity: 0.01,
    stepSize: 0.01,
    quantityPrecision: 2,
    tickSize: 0.0001,
    pricePrecision: 4,
    status: "TRADING",
  };
}

function eligibleSnap(
  partial: Partial<MarketSnapshot> & { symbol: string; marketId: number },
): MarketSnapshot {
  const meta = metaFor(partial.symbol, partial.marketId);
  const elig = evaluateMarketEligibility({
    meta,
    bookData: {
      bids: [["0.449", "100"]],
      asks: [[String(partial.bestAsk ?? 0.45), "2000"]],
    },
    ticker: { quoteVolume: 1000 },
    notionalUsd: 6,
    gatewayReachable: true,
  });
  return {
    symbol: partial.symbol,
    marketId: partial.marketId,
    base: "x",
    quote: "vUSDC",
    status: "TRADING",
    lastPrice: 0.45,
    midPrice: 0.45,
    bestBid: 0.449,
    bestAsk: partial.bestAsk ?? 0.45,
    spread: 0.001,
    spreadPct: 0.002,
    bidDepthLevels: 1,
    askDepthLevels: 1,
    bidDepthQty: 100,
    askDepthQty: 2000,
    askDepthUsd: partial.askDepthUsd ?? 900,
    bidDepthUsd: 44.9,
    volume24h: 100,
    quoteVolume24h: 1000,
    minNotional: 5,
    tickSize: 0.0001,
    stepSize: 0.01,
    pricePrecision: 4,
    quantityPrecision: 2,
    supportsLimit: true,
    supportsIoc: true,
    supportsMarket: false,
    liquidityScore: partial.score ?? 90,
    executionScore: partial.score ?? 90,
    score: partial.score ?? 90,
    expectedSlippageBps: 5,
    estimatedFillProbability: 0.9,
    executable: true,
    rejectReasons: [],
    unavailableReason: null,
    tradingEnabled: true,
    cancelOnly: false,
    maintenance: false,
    gatewayValidation: "PASS",
    lastVerified: new Date().toISOString(),
    eligibility: elig,
    meta,
    ...partial,
    executable: partial.executable ?? true,
  };
}

describe("eligibility engine", () => {
  it("dry validation builds LIMIT+IOC payload", () => {
    const dry = dryValidateBuyOrder({
      meta: metaFor("WSOSO_vUSDC", 4),
      bestAsk: 0.45,
      notionalUsd: 6,
      maxSlippageBps: 50,
    });
    expect(dry.ok).toBe(true);
    expect(dry.limitPrice).toBeTruthy();
    expect(dry.payloadHash).toMatch(/^0x[a-f0-9]{64}$/i);
  });

  it("rejects cancel-only status", () => {
    const elig = evaluateMarketEligibility({
      meta: { ...metaFor("X_vUSDC", 9), status: "CANCEL_ONLY" },
      bookData: { bids: [["1", "10"]], asks: [["1.01", "10"]] },
      notionalUsd: 6,
      gatewayReachable: true,
    });
    expect(elig.eligible).toBe(false);
    expect(elig.cancelOnly).toBe(true);
    expect(elig.failReason).toBe("Cancel Only");
  });

  it("rejects wide spread", () => {
    const elig = evaluateMarketEligibility({
      meta: metaFor("ETH_vUSDC", 2),
      bookData: { bids: [["100", "1"]], asks: [["120", "1"]] },
      notionalUsd: 6,
      gatewayReachable: true,
    });
    expect(elig.eligible).toBe(false);
    expect(elig.failReason).toBe("Spread too large");
  });
});

describe("selectExecutionRoute", () => {
  it("picks highest eligible score with no preferred bias", () => {
    const markets = [
      eligibleSnap({
        symbol: "vMAG7ssi_vUSDC",
        marketId: 3,
        score: 80,
        askDepthUsd: 600,
      }),
      eligibleSnap({
        symbol: "WSOSO_vUSDC",
        marketId: 4,
        score: 90,
        askDepthUsd: 900,
      }),
    ];
    const route = selectExecutionRoute({
      notionalUsd: 6,
      maxSlippageBps: 50,
      markets,
      profile,
    });
    expect(route.market.symbol).toBe("WSOSO_vUSDC");
  });

  it("honors parent-chosen eligible market", () => {
    const markets = [
      eligibleSnap({ symbol: "vBTC_vUSDC", marketId: 1, score: 95, bestAsk: 64000, askDepthUsd: 2000 }),
      eligibleSnap({ symbol: "WSOSO_vUSDC", marketId: 4, score: 70, askDepthUsd: 500 }),
    ];
    const route = selectExecutionRoute({
      notionalUsd: 6,
      maxSlippageBps: 50,
      markets,
      profile,
      chosenSymbol: "WSOSO_vUSDC",
    });
    expect(route.market.symbol).toBe("WSOSO_vUSDC");
  });

  it("rejects ineligible chosen market", () => {
    const bad = eligibleSnap({
      symbol: "vETH_vUSDC",
      marketId: 2,
      executable: false,
      rejectReasons: ["spread_ok"],
      unavailableReason: "Spread too large",
      gatewayValidation: "FAIL",
      score: 0,
    });
    bad.executable = false;
    expect(() =>
      selectExecutionRoute({
        notionalUsd: 6,
        maxSlippageBps: 50,
        markets: [bad],
        profile,
        chosenSymbol: "vETH_vUSDC",
      }),
    ).toThrow(/failed eligibility|not found|No eligible/i);
  });

  it("preferredSymbolOrder is empty", () => {
    expect(preferredSymbolOrder("BALANCED")).toEqual([]);
  });
});
