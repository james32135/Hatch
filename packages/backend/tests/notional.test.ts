import { describe, expect, it } from "vitest";
import { estimateNotionalUsd, assertNotionalCap } from "../src/services/notional.js";
import { getEnv, resetEnvCache } from "../src/config/env.js";
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { HatchError } from "../src/lib/errors.js";

for (const p of [resolve(process.cwd(), "../../.env"), resolve(process.cwd(), ".env")]) {
  if (existsSync(p)) loadDotenv({ path: p, override: false });
}
if (!process.env.SOSO_API_KEY && process.env.SoSoValue_API_key) {
  process.env.SOSO_API_KEY = process.env.SoSoValue_API_key;
}
resetEnvCache();
getEnv();

describe("notional cap", () => {
  it("estimates price * quantity", () => {
    expect(
      estimateNotionalUsd({ params: { price: "10", quantity: "2.5" } }),
    ).toBe(25);
  });

  it("rejects over cap", () => {
    const cap = getEnv().TRADING_MAX_NOTIONAL_USD;
    expect(() =>
      assertNotionalCap({
        params: { price: String(cap + 1), quantity: "1" },
      }),
    ).toThrow(HatchError);
  });

  it("sums batch order notionals", () => {
    expect(
      estimateNotionalUsd({
        accountID: 1,
        orders: [
          { price: "1", quantity: "3" },
          { price: "2", quantity: "2" },
        ],
      }),
    ).toBe(7);
  });

  it("treats market price 0 quantity as USD proxy", () => {
    expect(
      estimateNotionalUsd({
        orders: [{ price: "0", quantity: "5.5", type: 2 }],
      }),
    ).toBe(5.5);
  });
});
