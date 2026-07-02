/**
 * Integration: SIWE auth → create child → allowance policy (live Supabase).
 */
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { SiweMessage } from "siwe";
import { privateKeyToAccount } from "viem/accounts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { getEnv, resetEnvCache } from "../src/config/env.js";
import { getPrisma } from "../src/lib/prisma.js";
import type { FastifyInstance } from "fastify";

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

describe("auth → child → allowance (live db)", () => {
  let app: FastifyInstance;
  let token = "";
  let childId = "";
  const account = privateKeyToAccount(
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  );

  beforeAll(async () => {
    loadRootEnv();
    resetEnvCache();
    getEnv();
    getPrisma();
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    const prisma = getPrisma();
    if (childId) {
      await prisma.allowancePolicy.deleteMany({ where: { childId } });
      await prisma.child.deleteMany({ where: { id: childId } });
    }
    await prisma.user.deleteMany({
      where: { walletAddress: account.address.toLowerCase() },
    });
    await app.close();
  });

  it("SIWE verify returns JWT", async () => {
    const nonceRes = await app.inject({
      method: "GET",
      url: `/api/auth/nonce?address=${account.address}`,
    });
    expect(nonceRes.statusCode).toBe(200);
    const nonceBody = nonceRes.json() as {
      nonce: string;
      domain: string;
      uri: string;
      statement: string;
      chainId: number;
    };

    // Domain without port — SIWE ABNF is picky; uri may include port
    const domain = nonceBody.domain.split(":")[0] || "localhost";
    const message = new SiweMessage({
      domain,
      address: account.address as `0x${string}`,
      statement: nonceBody.statement,
      uri: nonceBody.uri.startsWith("http")
        ? nonceBody.uri
        : `http://${nonceBody.domain}`,
      version: "1",
      chainId: nonceBody.chainId || 1,
      nonce: nonceBody.nonce,
      issuedAt: new Date().toISOString(),
    });
    const prepared = message.prepareMessage();
    const signature = await account.signMessage({ message: prepared });

    const verifyRes = await app.inject({
      method: "POST",
      url: "/api/auth/verify",
      payload: { message: prepared, signature },
    });
    expect(verifyRes.statusCode).toBe(200);
    const body = verifyRes.json() as { token: string };
    expect(body.token).toBeTruthy();
    token = body.token;
  });

  it("creates child", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/children",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        displayName: "LoopTestKid",
        ageYears: 10,
        riskTier: "BALANCED",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { child: { id: string } };
    childId = body.child.id;
    expect(childId).toBeTruthy();
  });

  it("creates allowance policy", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/allowances",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        childId,
        amountUsd: 25,
        cadenceDays: 7,
        riskTier: "BALANCED",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { policy: { id: string; amountUsd: string } };
    expect(body.policy.id).toBeTruthy();
  });

  it("lists children and allowances", async () => {
    const children = await app.inject({
      method: "GET",
      url: "/api/children",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(children.statusCode).toBe(200);
    expect(
      (children.json() as { children: unknown[] }).children.length,
    ).toBeGreaterThan(0);

    const allowances = await app.inject({
      method: "GET",
      url: "/api/allowances",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(allowances.statusCode).toBe(200);
    expect(
      (allowances.json() as { policies: unknown[] }).policies.length,
    ).toBeGreaterThan(0);
  });

  it("mints child read-only JWT and blocks relay", async () => {
    const mint = await app.inject({
      method: "POST",
      url: "/api/auth/child-token",
      headers: { authorization: `Bearer ${token}` },
      payload: { childId },
    });
    expect(mint.statusCode).toBe(200);
    const childToken = (mint.json() as { token: string }).token;

    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${childToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { role: string }).role).toBe("child");

    const relay = await app.inject({
      method: "POST",
      url: "/api/sodex/relay",
      headers: { authorization: `Bearer ${childToken}` },
      payload: {
        path: "/orders",
        apiSign: "0x01" + "ab".repeat(65),
        apiNonce: String(Date.now()),
        payloadHash: "0x" + "11".repeat(32),
      },
    });
    expect(relay.statusCode).toBe(403);
  });
});
