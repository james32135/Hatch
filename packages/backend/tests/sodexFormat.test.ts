import { describe, expect, it } from "vitest";
import {
  formatPrice,
  formatQuantity,
  type SpotSymbolMeta,
} from "../src/services/sodexSymbols.js";

const mag7: SpotSymbolMeta = {
  id: 3,
  name: "vMAG7ssi_vUSDC",
  baseCoin: "vMAG7.ssi",
  minNotional: 5,
  minQuantity: 0.01,
  stepSize: 0.01,
  quantityPrecision: 2,
  tickSize: 0.0001,
  pricePrecision: 4,
  status: "TRADING",
};

describe("SoDEX formatPrice / formatQuantity (sosomind-equivalent)", () => {
  it("strips trailing zeros so 0.45 is not 0.4500", () => {
    expect(formatPrice(0.45, mag7)).toBe("0.45");
  });

  it("keeps significant tick decimals", () => {
    expect(formatPrice(0.4523, mag7)).toBe("0.4523");
  });

  it("formats quantity without padded zeros", () => {
    expect(formatQuantity(13.3, mag7)).toBe("13.3");
    expect(formatQuantity(13.34, mag7)).toBe("13.34");
  });
});
