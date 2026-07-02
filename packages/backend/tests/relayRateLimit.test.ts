import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { assertRelayRateLimit } from "../src/services/relayRateLimit.js";
import { HatchError } from "../src/lib/errors.js";
import { resetEnvCache, getEnv } from "../src/config/env.js";
import { redisRequired } from "../src/lib/redis.js";

for (const p of [
  resolve(process.cwd(), "../../.env"),
  resolve(process.cwd(), ".env"),
]) {
  if (existsSync(p)) loadDotenv({ path: p, override: false });
}
if (!process.env.SOSO_API_KEY && process.env.SoSoValue_API_key) {
  process.env.SOSO_API_KEY = process.env.SoSoValue_API_key;
}

describe("relay rate limit", () => {
  beforeAll(() => {
    resetEnvCache();
    getEnv();
    redisRequired();
  });

  it("allows under limit then blocks", async () => {
    const wallet = `0x${"cd".repeat(20)}`;
    for (let i = 0; i < 5; i++) {
      await assertRelayRateLimit(wallet, 5);
    }
    await expect(assertRelayRateLimit(wallet, 5)).rejects.toBeInstanceOf(
      HatchError,
    );
  });
});
