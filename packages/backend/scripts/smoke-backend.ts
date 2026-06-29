import { config } from "dotenv";
import { resolve } from "node:path";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { getEnv, resetEnvCache } from "../src/config/env.js";
import { buildApp } from "../src/app.js";
import { getPrisma } from "../src/lib/prisma.js";
import { TOKENS } from "../src/config/addresses.js";

config({ path: resolve(process.cwd(), "../../.env") });
if (!process.env.SOSO_API_KEY && process.env.SoSoValue_API_key) {
  process.env.SOSO_API_KEY = process.env.SoSoValue_API_key;
}

resetEnvCache();
getEnv();
getPrisma();

const app = await buildApp();
await app.listen({ port: 0, host: "127.0.0.1" });
const address = app.server.address();
const port = typeof address === "object" && address ? address.port : 0;
const baseUrl = `http://127.0.0.1:${port}`;

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];

async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (err) {
    results.push({
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

await check("health.live", async () => {
  const res = await fetch(`${baseUrl}/api/health/live`);
  if (!res.ok) throw new Error(`status ${res.status}`);
});

await check("health.ready", async () => {
  const res = await fetch(`${baseUrl}/api/health/ready`);
  if (!res.ok) throw new Error(`status ${res.status} ${await res.text()}`);
});

await check("config", async () => {
  const res = await fetch(`${baseUrl}/api/config`);
  const body = (await res.json()) as {
    custody: { backendOwnsSodexTradingKeys: boolean };
  };
  if (body.custody.backendOwnsSodexTradingKeys !== false) {
    throw new Error("custody flag wrong");
  }
});

await check("ssi.indices", async () => {
  const res = await fetch(`${baseUrl}/api/ssi/indices`);
  if (!res.ok) throw new Error(`status ${res.status} ${await res.text()}`);
});

await check("sodex.symbols", async () => {
  const res = await fetch(`${baseUrl}/api/sodex/markets/symbols`);
  if (!res.ok) throw new Error(`status ${res.status} ${await res.text()}`);
});

await check("base.token.read", async () => {
  const client = createPublicClient({
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });
  const code = await client.getBytecode({ address: TOKENS.mag7Ssi });
  if (!code || code === "0x") throw new Error("MAG7.ssi not a contract on Base");
});

await check("redis", async () => {
  const { redisRequired, redisPing, redisBackend } = await import(
    "../src/lib/redis.js"
  );
  redisRequired();
  if (!(await redisPing())) throw new Error(`redis ping failed (${redisBackend()})`);
});

await check("metrics", async () => {
  const res = await fetch(`${baseUrl}/api/metrics`);
  if (!res.ok) throw new Error(`status ${res.status}`);
  const body = (await res.json()) as {
    custody: { backendOwnsSodexTradingKeys: boolean };
    counts: { duePoliciesAwaitingParentSign?: number };
  };
  if (body.custody.backendOwnsSodexTradingKeys !== false) {
    throw new Error("custody flag wrong");
  }
  if (typeof body.counts.duePoliciesAwaitingParentSign !== "number") {
    throw new Error("missing duePoliciesAwaitingParentSign");
  }
});

await check("valuechain.contracts", async () => {
  const res = await fetch(`${baseUrl}/api/valuechain/contracts?network=mainnet`);
  if (!res.ok) throw new Error(`status ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { ok: boolean; hatchLog?: { bytecode: boolean } };
  if (!body.ok || !body.hatchLog?.bytecode) throw new Error("HATCHLog verify failed");
});

await check("valuechain.contracts.testnet", async () => {
  const res = await fetch(`${baseUrl}/api/valuechain/contracts?network=testnet`);
  if (!res.ok) throw new Error(`status ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { ok: boolean; hatchLog?: { bytecode: boolean } };
  if (!body.ok || !body.hatchLog?.bytecode) throw new Error("testnet HATCHLog verify failed");
});

await check("projections.assumptions", async () => {
  const res = await fetch(`${baseUrl}/api/projections/assumptions`);
  if (!res.ok) throw new Error(`status ${res.status}`);
  const body = (await res.json()) as { documentedYieldBands?: { base?: number } };
  if (!body.documentedYieldBands?.base) throw new Error("missing yield bands");
});

await check("ssi.flows.full", async () => {
  const res = await fetch(`${baseUrl}/api/ssi/flows/full?index=MAG7`);
  if (!res.ok) throw new Error(`status ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { mint?: { available?: boolean }; stake?: { path?: string } };
  if (!body.mint?.available) throw new Error("path A mint unavailable");
  if (body.stake?.path !== "SSI_EARN_REDIRECT" && body.stake?.path !== "B_BASE_MINT") {
    throw new Error("unexpected stake path");
  }
});

console.log(JSON.stringify({ baseUrl, results }, null, 2));
const failed = results.filter((r) => !r.ok);
await app.close();
process.exit(failed.length ? 1 : 0);
