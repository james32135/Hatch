import type { FastifyInstance } from "fastify";
import { SiweMessage } from "siwe";
import { getEnv } from "../config/env.js";
import { getPrisma } from "../lib/prisma.js";
import { HatchError } from "../lib/errors.js";

function normalizeAddress(address: string): string {
  return address.toLowerCase();
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/auth/nonce", async (req) => {
    const q = req.query as { address?: string };
    if (!q.address || !/^0x[a-fA-F0-9]{40}$/.test(q.address)) {
      throw new HatchError("invalid_address", "Valid wallet address required", 400);
    }
    const wallet = normalizeAddress(q.address);
    const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const prisma = getPrisma();
    await prisma.authNonce.create({
      data: { walletAddress: wallet, nonce, expiresAt },
    });
    return {
      address: wallet,
      nonce,
      expiresAt: expiresAt.toISOString(),
      statement: "Sign in to HATCH",
      domain: new URL(getEnv().FRONTEND_URL).hostname,
      uri: getEnv().FRONTEND_URL,
      chainId: 1,
    };
  });

  app.post("/api/auth/verify", async (req) => {
    const body = req.body as { message?: string; signature?: string };
    if (!body.message || !body.signature) {
      throw new HatchError("invalid_body", "message and signature required", 400);
    }
    const siwe = new SiweMessage(body.message);
    const { success, data, error } = await siwe.verify({ signature: body.signature });
    if (!success || !data) {
      throw new HatchError("sig_verify_failed", error?.type ?? "SIWE verify failed", 401);
    }
    const wallet = normalizeAddress(data.address);
    const prisma = getPrisma();
    const nonceRow = await prisma.authNonce.findFirst({
      where: {
        walletAddress: wallet,
        nonce: data.nonce,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!nonceRow) {
      throw new HatchError("sig_verify_failed", "Nonce missing or expired", 401);
    }
    await prisma.authNonce.delete({ where: { id: nonceRow.id } });

    const user = await prisma.user.upsert({
      where: { walletAddress: wallet },
      create: { walletAddress: wallet },
      update: {},
    });

    const token = await app.jwt.sign({
      sub: user.id,
      wallet,
      role: "parent" as const,
    });

    return {
      token,
      user: { id: user.id, walletAddress: wallet, role: "parent" },
    };
  });

  app.get(
    "/api/auth/me",
    { preHandler: [app.authenticate] },
    async (req) => {
      const prisma = getPrisma();
      if (req.user.role === "child") {
        if (!req.user.childId) {
          throw new HatchError("unauthorized", "Child token missing childId", 401);
        }
        const child = await prisma.child.findUnique({
          where: { id: req.user.childId },
        });
        if (!child) throw new HatchError("unauthorized", "Child not found", 401);
        return {
          role: "child" as const,
          childId: child.id,
          displayName: child.displayName,
          readingLevel: child.readingLevel,
          riskTier: child.riskTier,
          paused: child.paused,
          scopes: ["read:portfolio", "read:lessons"],
        };
      }
      const user = await prisma.user.findUnique({
        where: { id: req.user.sub },
        include: { children: true },
      });
      if (!user) throw new HatchError("unauthorized", "User not found", 401);
      return {
        id: user.id,
        walletAddress: user.walletAddress,
        role: req.user.role,
        children: user.children,
      };
    },
  );

  /** Parent mints a read-only JWT for a child view session */
  app.post(
    "/api/auth/child-token",
    { preHandler: [app.authenticate] },
    async (req) => {
      if (req.user.role !== "parent") {
        throw new HatchError("forbidden_child_write", "Parents only", 403);
      }
      const body = req.body as { childId?: string; ttlSeconds?: number };
      if (!body.childId) {
        throw new HatchError("invalid_body", "childId required", 400);
      }
      const child = await getPrisma().child.findFirst({
        where: { id: body.childId, parentId: req.user.sub },
      });
      if (!child) throw new HatchError("not_found", "Child not found", 404);

      const ttl = Math.min(
        Math.max(body.ttlSeconds ?? 86_400, 300),
        7 * 24 * 3600,
      );
      const token = await app.jwt.sign(
        {
          sub: child.id,
          wallet: req.user.wallet,
          role: "child" as const,
          childId: child.id,
        },
        { expiresIn: ttl },
      );
      return {
        token,
        role: "child",
        childId: child.id,
        scopes: ["read:portfolio", "read:lessons"],
        expiresIn: ttl,
        note: "Read-only. Cannot relay SoDEX orders or mutate policies.",
      };
    },
  );
}
