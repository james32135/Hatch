/**
 * Integration: SIWE → allowance → sign-draft → parent EIP-712 sign → relay verify.
 * Backend never custodies keys; parent signs with the SIWE wallet.
 * SoDEX gateway may reject (test wallet may lack account) — we assert our verify path.
 */
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { SiweMessage } from "siwe";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { getEnv, resetEnvCache } from "../src/config/env.js";
import { getPrisma } from "../src/lib/prisma.js";
import { normalizeEcdsaV } from "../src/services/engSodexSigner.js";
import { SODEX_EXCHANGE_TYPES } from "../src/services/sodexSign.js";
import { assertRelayBodyMatchesPayloadHash } from "../src/services/parentSignDraft.js";
import { reloadCapabilitiesFromProbe } from "../src/services/marketCapability.js";

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

describe("auth → sign-draft → relay (parent-signed)", () => {
  let app: FastifyInstance;
  let token = "";
  let childId = "";
  let policyId = "";
  const account = privateKeyToAccount(
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  );

  beforeAll(async () => {
    loadRootEnv();
    resetEnvCache();
    getEnv();
    getPrisma();
    await reloadCapabilitiesFromProbe("testnet");
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

  it("SIWE + child + allowance + cached accountID", async () => {
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
    const verifyBody = verifyRes.json() as {
      token: string;
      user: { id: string };
    };
    token = verifyBody.token;
    const parentId = verifyBody.user.id;

    const childRes = await app.inject({
      method: "POST",
      url: "/api/children",
      headers: { authorization: `Bearer ${token}` },
      payload: { displayName: "DraftFlowKid", ageYears: 9, riskTier: "BALANCED" },
    });
    expect(childRes.statusCode).toBe(200);
    childId = (childRes.json() as { child: { id: string } }).child.id;

    const polRes = await app.inject({
      method: "POST",
      url: "/api/allowances",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        childId,
        amountUsd: 10,
        cadenceDays: 7,
        riskTier: "BALANCED",
      },
    });
    expect(polRes.statusCode).toBe(200);
    policyId = (polRes.json() as { policy: { id: string } }).policy.id;

    await getPrisma().user.update({
      where: { id: parentId },
      data: { sodexAccountIdTestnet: 54647 },
    });
  });

  it("sign-draft returns UNSIGNED relayRequest; bad sig rejected", async () => {
    const draftRes = await app.inject({
      method: "POST",
      url: "/api/allowances/sign-draft",
      headers: {
        authorization: `Bearer ${token}`,
        "x-hatch-profile": "testnet",
      },
      payload: { policyId, network: "testnet", symbol: "WSOSO_vUSDC" },
    });
    expect(draftRes.statusCode, JSON.stringify(draftRes.json())).toBe(200);
    const { draft, accountID } = draftRes.json() as {
      draft: {
        status: string;
        payloadHash: Hex;
        params: unknown;
        path: string;
        typedData: {
          domain: Record<string, unknown>;
          types: typeof SODEX_EXCHANGE_TYPES;
          primaryType: "ExchangeAction";
          message: { payloadHash: Hex; nonce: string };
        };
        relayRequest: Record<string, unknown>;
      };
      accountID: number;
    };
    expect(draft.status).toBe("UNSIGNED");
    expect(accountID).toBe(54647);
    expect(draft.relayRequest.apiSign).toBeNull();
    assertRelayBodyMatchesPayloadHash({
      path: draft.path,
      body: draft.params,
      payloadHash: draft.payloadHash,
    });

    const bad = await app.inject({
      method: "POST",
      url: "/api/sodex/relay",
      headers: {
        authorization: `Bearer ${token}`,
        "x-hatch-profile": "testnet",
      },
      payload: {
        ...draft.relayRequest,
        apiSign: "0x01" + "ab".repeat(65),
      },
    });
    expect(bad.statusCode).toBe(401);
  });

  it("parent signs typedData; relay accepts signature (gateway may still fail)", async () => {
    const draftRes = await app.inject({
      method: "POST",
      url: "/api/allowances/sign-draft",
      headers: {
        authorization: `Bearer ${token}`,
        "x-hatch-profile": "testnet",
      },
      payload: {
        policyId,
        network: "testnet",
        symbol: "WSOSO_vUSDC",
        mids: { mag7: "1.00", ussi: "1.00" },
      },
    });
    expect(draftRes.statusCode, JSON.stringify(draftRes.json())).toBe(200);
    const { draft } = draftRes.json() as {
      draft: {
        typedData: {
          domain: {
            name: string;
            version: string;
            chainId: number;
            verifyingContract: `0x${string}`;
          };
          types: typeof SODEX_EXCHANGE_TYPES;
          primaryType: "ExchangeAction";
          message: { payloadHash: Hex; nonce: string };
        };
        relayRequest: Record<string, unknown>;
      };
    };

    const sig = await account.signTypedData({
      domain: draft.typedData.domain,
      types: draft.typedData.types,
      primaryType: "ExchangeAction",
      message: {
        payloadHash: draft.typedData.message.payloadHash,
        nonce: BigInt(draft.typedData.message.nonce),
      },
    });
    const apiSign = `0x01${normalizeEcdsaV(sig).slice(2)}`;

    const relay = await app.inject({
      method: "POST",
      url: "/api/sodex/relay",
      headers: {
        authorization: `Bearer ${token}`,
        "x-hatch-profile": "testnet",
      },
      payload: {
        ...draft.relayRequest,
        apiSign,
      },
    });
    // Signature must pass our EIP-712 check (not 401). Gateway may 4xx/5xx.
    expect(relay.statusCode).not.toBe(401);
    expect(relay.statusCode).not.toBe(400);
    const body = relay.json() as { verified?: boolean; relayed?: boolean };
    if (relay.statusCode === 200) {
      expect(body.verified).toBe(true);
      expect(body.relayed).toBe(true);
    }
  });
});
