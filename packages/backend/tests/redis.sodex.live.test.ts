/**
 * Live Redis (Upstash REST) + eng SoDEX read tests.
 * SODEX_* credentials are ENGINEERING TEST ONLY — never production user custody.
 */
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { resetEnvCache, getEnv } from "../src/config/env.js";
import {
  redisRequired,
  redisPing,
  redisGet,
  redisSet,
  redisDel,
  redisBackend,
} from "../src/lib/redis.js";
import { createSodexClient } from "../src/clients/sodex.js";
import { resolveProfile } from "../src/config/environment.js";
import { engSodexAddress, engSodexAccountId } from "../src/services/engSodexSigner.js";
import { assertMainnetTestGuard } from "../src/services/mainnetTestGuard.js";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { getSoSoValueClient } from "../src/clients/sosovalue.js";

function loadRootEnv(): void {
  for (const p of [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
  ]) {
    if (existsSync(p)) loadDotenv({ path: p, override: false });
  }
  if (!process.env.SOSO_API_KEY && process.env.SoSoValue_API_key) {
    process.env.SOSO_API_KEY = process.env.SoSoValue_API_key;
  }
}

describe("redis upstash live", () => {
  beforeAll(() => {
    loadRootEnv();
    resetEnvCache();
    getEnv();
    redisRequired();
  });

  it("pings and round-trips a key", async () => {
    expect(redisBackend()).toBe("upstash-rest");
    expect(await redisPing()).toBe(true);
    const key = `hatch:test:${Date.now()}`;
    await redisSet(key, "ok", 30);
    expect(await redisGet(key)).toBe("ok");
    await redisDel(key);
  });
});

describe("eng SoDEX credentials (testnet reads)", () => {
  beforeAll(() => {
    loadRootEnv();
    resetEnvCache();
    getEnv();
  });

  it("private key matches SODEX_ADDRESS", () => {
    const raw = process.env.SODEX_PRIVATE_KEY!.replace(/^"|"$/g, "");
    const pk = (raw.startsWith("0x") ? raw : `0x${raw}`) as Hex;
    const account = privateKeyToAccount(pk);
    expect(account.address.toLowerCase()).toBe(engSodexAddress().toLowerCase());
  });

  it("reads testnet account state for eng address", async () => {
    const profile = resolveProfile("testnet");
    const client = createSodexClient(profile);
    const state = await client.accountState(engSodexAddress());
    expect(state).toBeTruthy();
    // account id from env is eng reference — state shape may vary
    expect(engSodexAccountId()).toBeGreaterThan(0);
  });

  it("reads live symbols and SoSoValue indices", async () => {
    const symbols = await createSodexClient(resolveProfile("testnet")).marketsSymbols();
    expect(symbols).toBeTruthy();
    const indices = await getSoSoValueClient().indices();
    expect(indices).toBeTruthy();
  });

  it("MAINNET_TEST_GUARD aborts harness if amount > 1", () => {
    expect(() => assertMainnetTestGuard("mainnet", 1.5)).toThrow(/1/);
  });
});
