import { describe, expect, it } from "vitest";
import {
  assertMainnetTestGuard,
  MAINNET_TEST_MAX_USDC,
} from "../src/services/mainnetTestGuard.js";
import { HatchError } from "../src/lib/errors.js";

describe("MAINNET_TEST_GUARD", () => {
  it("allows testnet any size", () => {
    expect(() => assertMainnetTestGuard("testnet", 500)).not.toThrow();
  });

  it("allows mainnet at or under 1 USDC", () => {
    expect(() => assertMainnetTestGuard("mainnet", 0.2)).not.toThrow();
    expect(() => assertMainnetTestGuard("mainnet", 1)).not.toThrow();
  });

  it("rejects mainnet above 1 USDC", () => {
    expect(() => assertMainnetTestGuard("mainnet", 1.01)).toThrow(HatchError);
    expect(() => assertMainnetTestGuard("mainnet", 100)).toThrow(HatchError);
    try {
      assertMainnetTestGuard("mainnet", 5);
    } catch (err) {
      expect(err).toBeInstanceOf(HatchError);
      expect((err as HatchError).code).toBe("mainnet_test_guard");
      expect((err as HatchError).details).toMatchObject({
        max: MAINNET_TEST_MAX_USDC,
      });
    }
  });
});
