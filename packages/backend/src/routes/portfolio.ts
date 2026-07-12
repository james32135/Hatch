import type { FastifyInstance } from "fastify";
import { getEnv } from "../config/env.js";
import { resolveProfile } from "../config/environment.js";
import { createSodexClient } from "../clients/sodex.js";
import { getPrisma } from "../lib/prisma.js";
import { HatchError } from "../lib/errors.js";
import { projectPortfolioUsd } from "../services/portfolioProjection.js";
import { priceAccountState } from "../services/snapshotPricing.js";
import { buildPortfolioEngineView } from "../services/portfolioEngine.js";
import { assertChildAccess } from "../lib/childAccess.js";

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
      let accountBalances: unknown = null;
      let sodexError: string | undefined;
      try {
        accountState = await sodex.accountState(parent.walletAddress);
      } catch (err) {
        sodexError = err instanceof Error ? err.message : String(err);
      }
      try {
        accountBalances = await sodex.accountBalances(parent.walletAddress);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        sodexError = [sodexError, `balances: ${msg}`].filter(Boolean).join("; ");
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
          accountBalances,
          profileId: profile.id,
        });
      } catch (err) {
        sodexError = [
          sodexError,
          err instanceof Error ? err.message : String(err),
        ]
          .filter(Boolean)
          .join("; ");
      }

      const liveTotalUsd =
        engine?.performance?.currentUsd ?? engine?.projection?.totalUsd ?? null;
      const snapshotTotalUsd =
        latest?.totalUsd != null ? Number(latest.totalUsd.toString()) : null;
      // Never promote snapshot to live totalUsd — clients must label last-known separately.
      const totalUsd = liveTotalUsd;
      const freshness = {
        live: liveTotalUsd != null && !sodexError,
        source:
          liveTotalUsd != null
            ? ("live" as const)
            : snapshotTotalUsd != null
              ? ("snapshot" as const)
              : ("unavailable" as const),
        pricedAt: engine?.projection?.pricedAt ?? null,
        snapshotAt: latest?.createdAt ?? null,
        sodexError: sodexError ?? null,
        sharedAccount: true,
        note: "Parent SoDEX account is shared across children. Child view is read-only.",
        waitingReason:
          liveTotalUsd != null
            ? null
            : sodexError
              ? "sodex_read_failed"
              : engine?.projection?.warnings?.length
                ? "holdings_unpriced"
                : snapshotTotalUsd != null
                  ? "snapshot_only"
                  : "no_balances",
      };
      const ownership = {
        model: "family_shared_spot_account" as const,
        owner: "parent" as const,
        scope: "family" as const,
        childAllocationSupported: false,
        childAllocatedPrincipalUsd: null,
        childAllocatedMarketValueUsd: null,
        childAllocatedHoldings: null,
        childContext: {
          childId: child.id,
          relationship: "read_only_view_and_plan_attribution" as const,
        },
        explanation:
          "Balances belong to the parent's shared SoDEX spot account. childId grants access and attributes plans/orders/lessons; it does not establish asset ownership.",
      };
      const valuation = {
        scope: "spot_trading_value" as const,
        method: engine?.projection?.valuationMethod ?? null,
        excludes: ["futures", "EVM funding", "external SSI staking"],
        comparisonTarget: "SoDEX Trading Value (spot), not SoDEX Total Assets",
        pricedAt: engine?.projection?.pricedAt ?? null,
      };

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
        sodexBalances: accountBalances,
        totalUsd,
        liveTotalUsd,
        familySpotTotalUsd: liveTotalUsd,
        childAllocatedTotalUsd: null,
        snapshotTotalUsd,
        freshness,
        ownership,
        valuation,
        projection: engine?.projection ?? null,
        warnings: engine?.projection?.warnings ?? [],
        holdings: engine?.holdings ?? [],
        allocation: engine?.allocation ?? null,
        performance: engine?.performance ?? null,
        history: engine?.history ?? [],
        transactions: engine?.transactions ?? [],
        staking: engine?.staking ?? null,
        sodexError,
        latestSnapshot: latest,
        note: "Parent-owned family SoDEX spot account. Child is read-only; no child allocation ledger exists. Snapshot is never shown as live.",
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
      return {
        childId,
        scope: "family_shared_spot_account",
        owner: "parent",
        history: snapshotsToHistory(rows),
        note: "Snapshots are tagged by child view context but contain the parent's family spot account value.",
      };
    },
  );

  app.get(
    "/api/portfolio/:childId/transactions",
    { preHandler: [app.authenticate] },
    async (req) => {
      const { childId } = req.params as { childId: string };
      await assertChildAccess(req, childId);
      // Prefer this child's orders. Shared SoDEX account still backs portfolio totals.
      const orders = await getPrisma().signedOrder.findMany({
        where: { childId },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return {
        childId,
        scope: "child_plan_attribution",
        assetOwner: "parent",
        parentWalletNote:
          "Orders are attributed to this child's plan. Filled assets remain in the shared parent SoDEX account.",
        transactions: orders,
      };
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
      let balances: unknown = null;
      try {
        balances = await sodex.accountBalances(req.user.wallet);
      } catch {
        balances = null;
      }
      const envEnum =
        profile.id === "testnet"
          ? "TESTNET"
          : profile.id === "mainnet-readonly"
            ? "MAINNET_READONLY"
            : "MAINNET";

      let priced: Awaited<ReturnType<typeof priceAccountState>> | null = null;
      try {
        priced = await priceAccountState(state, balances, profile.id);
      } catch {
        priced = null;
      }

      const snapshot = await prisma.portfolioSnapshot.create({
        data: {
          childId,
          environment: envEnum,
          rawBalancesJson: { state, balances } as object,
          source: priced ? "sodex+priced" : "sodex",
          totalUsd: priced?.totalUsd ?? undefined,
          mag7Qty: priced?.mag7Qty ?? undefined,
          ussiQty: priced?.ussiQty ?? undefined,
          smag7Qty: priced?.smag7Qty ?? undefined,
        },
      });
      return {
        snapshot,
        projection:
          priced?.projection ??
          (await projectPortfolioUsd(state, balances, profile.id).catch(() => null)),
        ownership: {
          model: "family_shared_spot_account",
          owner: "parent",
          childAllocationSupported: false,
        },
      };
    },
  );
}
