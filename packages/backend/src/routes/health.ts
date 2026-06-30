import type { FastifyInstance } from "fastify";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { getEnv } from "../config/env.js";
import { resolveProfile } from "../config/environment.js";
import { BASE, TOKENS } from "../config/addresses.js";
import { getAiClient } from "../clients/ai/index.js";
import { getPrisma } from "../lib/prisma.js";
import { redisPing } from "../lib/redis.js";
import { getSoSoValueClient } from "../clients/sosovalue.js";
import { createSodexClient } from "../clients/sodex.js";

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health/live", async () => ({ ok: true, service: "hatch-backend" }));

  app.get("/api/health/ready", async (_req, reply) => {
    try {
      await getPrisma().$queryRaw`SELECT 1`;
      const redisOk = await redisPing();
      if (!redisOk) {
        return reply.code(503).send({
          ok: false,
          error: "redis_unavailable",
          message: "Redis ping failed",
        });
      }
      return { ok: true, redis: true };
    } catch (err) {
      return reply.code(503).send({
        ok: false,
        error: "not_ready",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.get("/api/health", async () => {
    const env = getEnv();
    const profile = resolveProfile(env.HATCH_DEFAULT_PROFILE);
    const checks: Record<string, { ok: boolean; detail?: string; ms?: number }> = {};

    const t0 = Date.now();
    try {
      await getPrisma().$queryRaw`SELECT 1`;
      checks.postgres = { ok: true, ms: Date.now() - t0 };
    } catch (err) {
      checks.postgres = {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
      };
    }

    const t1 = Date.now();
    const redisOk = await redisPing();
    checks.redis = {
      ok: redisOk,
      detail: redisOk
        ? `pong (${process.env.UPSTASH_REDIS_REST_URL ? "upstash-rest" : "redis-url"})`
        : "unreachable",
      ms: Date.now() - t1,
    };

    const t2 = Date.now();
    try {
      await getSoSoValueClient().indices();
      checks.sosovalue = { ok: true, ms: Date.now() - t2 };
    } catch (err) {
      checks.sosovalue = {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        ms: Date.now() - t2,
      };
    }

    const t3 = Date.now();
    try {
      await createSodexClient(profile).marketsSymbols();
      checks.sodex = { ok: true, ms: Date.now() - t3 };
    } catch (err) {
      checks.sodex = {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        ms: Date.now() - t3,
      };
    }

    const t4 = Date.now();
    try {
      const rpc = await fetch(profile.valuechainRpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      });
      const body = (await rpc.json()) as { result?: string };
      const expected = `0x${profile.chainId.toString(16)}`;
      checks.valuechainRpc = {
        ok: rpc.ok && !!body.result,
        detail: `${body.result} (expect ${expected})`,
        ms: Date.now() - t4,
      };
    } catch (err) {
      checks.valuechainRpc = {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        ms: Date.now() - t4,
      };
    }

    const t5 = Date.now();
    try {
      const client = createPublicClient({
        chain: base,
        transport: http(process.env.BASE_RPC_URL ?? BASE.rpcUrl),
      });
      const code = await client.getBytecode({ address: TOKENS.mag7Ssi });
      checks.baseRpc = {
        ok: !!code && code !== "0x",
        detail: "MAG7.ssi bytecode present",
        ms: Date.now() - t5,
      };
    } catch (err) {
      checks.baseRpc = {
        ok: false,
        detail: err instanceof Error ? err.message : String(err),
        ms: Date.now() - t5,
      };
    }

    checks.ai = {
      ok: getAiClient().listProviders().length > 0,
      detail: getAiClient()
        .listProviders()
        .map((p) => p.id)
        .join(","),
    };

    const criticalOk = checks.postgres.ok;
    return {
      ok: criticalOk,
      profile: profile.id,
      killSwitch: env.KILL_SWITCH,
      custody: {
        backendOwnsSodexTradingKeys: false,
      },
      tradingMaxNotionalUsd: env.TRADING_MAX_NOTIONAL_USD,
      checks,
    };
  });
}
