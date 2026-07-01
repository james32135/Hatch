import type { FastifyInstance } from "fastify";
import { getEnv } from "../config/env.js";
import { resolveProfile } from "../config/environment.js";
import { createSodexClient } from "../clients/sodex.js";
import { getPrisma } from "../lib/prisma.js";
import { HatchError } from "../lib/errors.js";
import { projectPortfolioUsd } from "../services/portfolioProjection.js";
import { priceAccountState } from "../services/snapshotPricing.js";
import { buildPortfolioEngineView } from "../services/portfolioEngine.js";

async function assertChildAccess(
  req: { user: { role: string; sub: string; childId?: string } },
  childId: string,
) {
  const child = await getPrisma().child.findUnique({ where: { id: childId } });
  if (!child) throw new HatchError("not_found", "Child not found", 404);
  if (req.user.role === "parent" && child.parentId !== req.user.sub) {
    throw new HatchError("forbidden", "Not your child", 403);
  }
  if (req.user.role === "child" && req.user.childId !== childId) {
    throw new HatchError("forbidden", "Wrong child token", 403);
  }
  return child;
}

export async function registerPortfolioRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/portfolio/:childId",
    { preHandler: [app.authenticate] },
    async (req) => {
      const { childId } = req.params as { childId: string };
      const child = await assertChildAccess(req, childId);

      const profile = resolveProfile(
        (req.headers["x-hatch-profile"] as string | undefined) ??
          getEnv().HATCH_DEFAULT_PROFILE,
      );
      const parent = await getPrisma().user.findUnique({
        where: { id: child.parentId },
      });
      if (!parent) throw new HatchError("not_found", "Parent missing", 404);

      const sodex = createSodexClient(profile);
      let accountState: unknown = null;
      let sodexError: string | undefined;
      try {
        accountState = await sodex.accountState(parent.walletAddress);
      } catch (err) {
        sodexError = err instanceof Error ? err.message : String(err);
      }

      const latest = await getPrisma().portfolioSnapshot.findFirst({
        where: { childId },
        orderBy: { createdAt: "desc" },
      });

      let engine = null;
      try {
        engine = await buildPortfolioEngineView({
          childId,
          parentId: parent.id,
          parentWallet: parent.walletAddress,
          accountState,
        });
      } catch (err) {
        sodexError = [
          sodexError,
          err instanceof Error ? err.message : String(err),
        ]
          .filter(Boolean)
          .join("; ");
      }

      return {
        child: {
          id: child.id,
          displayName: child.displayName,
          riskTier: child.riskTier,
          paused: child.paused,
        },
        profile: profile.id,
        parentWallet: parent.walletAddress,
        sodexAccountState: accountState,
        projection: engine?.projection ?? null,
        holdings: engine?.holdings ?? [],
        allocation: engine?.allocation ?? null,
        performance: engine?.performance ?? null,
        history: engine?.history ?? [],
        transactions: engine?.transactions ?? [],
        staking: engine?.staking ?? null,
        sodexError,
        latestSnapshot: latest,
        note: "Balances are parent SoDEX account reads. Child is view-only. No invented prices.",
      };
    },
  );

  app.get(
    "/api/portfolio/:childId/history",
    { preHandler: [app.authenticate] },
    async (req) => {
      const { childId } = req.params as { childId: string };
      await assertChildAccess(req, childId);
      const limit = Math.min(
        500,
        Number((req.query as { limit?: string }).limit ?? 90) || 90,
      );
      const rows = await getPrisma().portfolioSnapshot.findMany({
        where: { childId },
        orderBy: { createdAt: "asc" },
        take: limit,
      });
      const { snapshotsToHistory } = await import("../services/portfolioEngine.js");
      return { childId, history: snapshotsToHistory(rows) };
    },
  );

  app.get(
    "/api/portfolio/:childId/transactions",
    { preHandler: [app.authenticate] },
    async (req) => {
      const { childId } = req.params as { childId: string };
      const child = await assertChildAccess(req, childId);
      const orders = await getPrisma().signedOrder.findMany({
        where: {
          OR: [{ childId }, { parentId: child.parentId }],
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return { childId, transactions: orders };
    },
  );

  app.post(
    "/api/portfolio/:childId/snapshot",
    { preHandler: [app.authenticate] },
    async (req) => {
      if (req.user.role !== "parent") {
        throw new HatchError("forbidden_child_write", "Parents only", 403);
      }
      const { childId } = req.params as { childId: string };
      const prisma = getPrisma();
      const child = await prisma.child.findFirst({
        where: { id: childId, parentId: req.user.sub },
      });
      if (!child) throw new HatchError("not_found", "Child not found", 404);

      const profile = resolveProfile(
        (req.headers["x-hatch-profile"] as string | undefined) ??
          getEnv().HATCH_DEFAULT_PROFILE,
      );
      const sodex = createSodexClient(profile);
      const state = await sodex.accountState(req.user.wallet);
      const envEnum =
        profile.id === "testnet"
          ? "TESTNET"
          : profile.id === "mainnet-readonly"
            ? "MAINNET_READONLY"
            : "MAINNET";

      let priced: Awaited<ReturnType<typeof priceAccountState>> | null = null;
      try {
        priced = await priceAccountState(state);
      } catch {
        priced = null;
      }

      const snapshot = await prisma.portfolioSnapshot.create({
        data: {
          childId,
          environment: envEnum,
          rawBalancesJson: state as object,
          source: priced ? "sodex+priced" : "sodex",
          totalUsd: priced?.totalUsd ?? undefined,
          mag7Qty: priced?.mag7Qty ?? undefined,
          ussiQty: priced?.ussiQty ?? undefined,
          smag7Qty: priced?.smag7Qty ?? undefined,
        },
      });
      return {
        snapshot,
        projection: priced?.projection ?? (await projectPortfolioUsd(state).catch(() => null)),
      };
    },
  );
}
