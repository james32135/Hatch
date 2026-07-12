/**
 * Job handlers — portfolio sync, market sync, allowance, lessons, cleanup.
 * All non-custodial: never places SoDEX trades without parent signature.
 */
import { getEnv } from "../config/env.js";
import { resolveProfile } from "../config/environment.js";
import { createSodexClient } from "../clients/sodex.js";
import { getSoSoValueClient } from "../clients/sosovalue.js";
import { getPrisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { redisSet, redisGet, redisAcquireLock, redisReleaseLock } from "../lib/redis.js";
import { generateLessonForChild } from "../agents/education.js";
import { runAllowanceDueHandoffs } from "../services/allowanceHandoff.js";
import {
  priceAccountState,
  snapshotMateriallyChanged,
} from "../services/snapshotPricing.js";
import {
  dequeueJob,
  enqueueJob,
  markJobCompleted,
  requeueOrDeadLetter,
  type JobName,
  type JobPayload,
} from "./queue.js";
import { randomUUID } from "node:crypto";

const LOCK_TTL = 55;

export async function processOneJob(): Promise<boolean> {
  const job = await dequeueJob();
  if (!job) return false;

  const lockKey = `hatch:joblock:${job.name}:${job.id}`;
  const token = randomUUID();
  const got = await redisAcquireLock(lockKey, token, LOCK_TTL);
  if (!got) {
    // Another worker holds it — put same payload back
    const { redisLPush } = await import("../lib/redis.js");
    await redisLPush("hatch:jobs:queue", JSON.stringify(job));
    return true;
  }

  try {
    await dispatch(job);
    await markJobCompleted(job);
  } catch (err) {
    await requeueOrDeadLetter(job, err);
  } finally {
    await redisReleaseLock(lockKey, token);
  }
  return true;
}

async function dispatch(job: JobPayload): Promise<void> {
  switch (job.name) {
    case "portfolio_sync":
      await runPortfolioSync({
        profileId: job.data.profileId ? String(job.data.profileId) : undefined,
        childId: job.data.childId ? String(job.data.childId) : undefined,
        triggerDelta:
          job.data.triggerDelta != null ? Number(job.data.triggerDelta) : undefined,
      });
      break;
    case "market_sync":
      await runMarketSync();
      break;
    case "allowance_scheduler":
      await runAllowanceDueHandoffs();
      break;
    case "lesson_generation": {
      const childId = String(job.data.childId ?? "");
      if (!childId) throw new Error("lesson_generation requires childId");
      const triggerDelta =
        job.data.triggerDelta != null ? Number(job.data.triggerDelta) : undefined;
      // Skip empty flat spam when no real portfolio movement was provided
      if (
        triggerDelta === undefined ||
        !Number.isFinite(triggerDelta) ||
        Math.abs(triggerDelta) < 0.01
      ) {
        logger.info(
          { childId, triggerDelta },
          "lesson_generation skipped — no material portfolio delta",
        );
        break;
      }
      await generateLessonForChild({
        childId,
        triggerDelta,
        skipCache: true,
      });
      break;
    }
    case "order_fill_verify": {
      const signedOrderId = String(job.data.signedOrderId ?? "");
      const wallet = String(job.data.wallet ?? "");
      if (!signedOrderId || !wallet) {
        throw new Error("order_fill_verify requires signedOrderId + wallet");
      }
      const profile = resolveProfile(
        String(job.data.profileId ?? getEnv().HATCH_DEFAULT_PROFILE),
      );
      const { verifySignedOrderAgainstSodex } = await import(
        "../services/orderFillVerify.js"
      );
      await verifySignedOrderAgainstSodex({
        signedOrderId,
        profile,
        wallet,
      });
      break;
    }
    case "cleanup":
      await runCleanup();
      break;
    case "retry_drain":
      // Drain is processOneJob itself; no-op marker
      break;
    default: {
      const _exhaustive: never = job.name;
      throw new Error(`unknown job ${_exhaustive}`);
    }
  }
}

export async function runPortfolioSync(opts?: {
  profileId?: string;
  childId?: string;
  triggerDelta?: number;
}): Promise<{ children: number }> {
  const prisma = getPrisma();
  const env = getEnv();
  const profile = resolveProfile(opts?.profileId ?? env.HATCH_DEFAULT_PROFILE);
  const children = await prisma.child.findMany({
    where: {
      paused: false,
      ...(opts?.childId ? { id: opts.childId } : {}),
    },
    include: { parent: true },
    take: 50,
  });

  const sodex = createSodexClient(profile);
  const envEnum =
    profile.id === "testnet"
      ? "TESTNET"
      : profile.id === "mainnet-readonly"
        ? "MAINNET_READONLY"
        : "MAINNET";

  let ok = 0;
  for (const child of children) {
    try {
      const state = await sodex.accountState(child.parent.walletAddress);
      let balances: unknown = null;
      try {
        balances = await sodex.accountBalances(child.parent.walletAddress);
      } catch {
        balances = null;
      }
      const prev = await prisma.portfolioSnapshot.findFirst({
        where: { childId: child.id },
        orderBy: { createdAt: "desc" },
      });

      let priced: Awaited<ReturnType<typeof priceAccountState>> | null = null;
      try {
        priced = await priceAccountState(state, balances, profile.id);
      } catch (err) {
        logger.warn(
          { childId: child.id, err: String(err) },
          "snapshot pricing failed — storing raw balances only",
        );
      }

      await prisma.portfolioSnapshot.create({
        data: {
          childId: child.id,
          environment: envEnum,
          rawBalancesJson: { state, balances } as object,
          source: priced ? "sodex-job+priced" : "sodex-job",
          totalUsd: priced?.totalUsd ?? undefined,
          mag7Qty: priced?.mag7Qty ?? undefined,
          ussiQty: priced?.ussiQty ?? undefined,
          smag7Qty: priced?.smag7Qty ?? undefined,
        },
      });

      const prevUsd =
        prev?.totalUsd != null ? Number(prev.totalUsd.toString()) : null;
      const nextUsd = priced?.totalUsd ?? null;
      const computedDelta =
        opts?.triggerDelta ??
        (prevUsd != null && nextUsd != null ? nextUsd - prevUsd : undefined);

      if (
        snapshotMateriallyChanged(prev, {
          totalUsd: priced?.totalUsd ?? null,
          rawBalancesJson: state,
        })
      ) {
        await enqueueJob("lesson_generation", {
          childId: child.id,
          triggerDelta: computedDelta,
        });
      }
      ok += 1;
    } catch (err) {
      logger.warn(
        { childId: child.id, err: String(err) },
        "portfolio_sync child failed",
      );
    }
  }
  return { children: ok };
}

export async function runMarketSync(): Promise<void> {
  const soso = getSoSoValueClient();
  const [indices, mag7Constituents] = await Promise.all([
    soso.indices(),
    soso.mag7Constituents().catch(() => null),
  ]);
  const at = new Date().toISOString();
  await redisSet("hatch:market:indices", JSON.stringify({ at, indices }), 120);
  if (mag7Constituents) {
    await redisSet(
      "hatch:market:mag7_constituents",
      JSON.stringify({ at, mag7Constituents }),
      120,
    );
  }
}

export async function runCleanup(): Promise<{
  snapshotsDeleted: number;
  eventsDeleted: number;
}> {
  const prisma = getPrisma();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const softCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Keep last 30d snapshots; prune older job_completed events > 7d
  const [snap, ev] = await Promise.all([
    prisma.portfolioSnapshot.deleteMany({
      where: { createdAt: { lt: cutoff } },
    }),
    prisma.systemEvent.deleteMany({
      where: {
        kind: { in: ["job_completed", "heartbeat"] },
        createdAt: { lt: softCutoff },
      },
    }),
  ]);

  logger.info(
    { snapshotsDeleted: snap.count, eventsDeleted: ev.count },
    "cleanup job done",
  );
  return { snapshotsDeleted: snap.count, eventsDeleted: ev.count };
}

export async function scheduleNamedJobs(): Promise<void> {
  const names: JobName[] = [
    "portfolio_sync",
    "market_sync",
    "allowance_scheduler",
  ];
  for (const name of names) {
    const gate = `hatch:schedgate:${name}`;
    const recent = await redisGet(gate);
    if (recent) continue;
    await enqueueJob(name);
    const ttl =
      name === "portfolio_sync"
        ? 55
        : name === "market_sync"
          ? 25
          : 14 * 60;
    await redisSet(gate, new Date().toISOString(), ttl);
  }

  // Daily cleanup gate
  const cleanGate = await redisGet("hatch:schedgate:cleanup");
  if (!cleanGate) {
    await enqueueJob("cleanup");
    await redisSet("hatch:schedgate:cleanup", new Date().toISOString(), 86_400);
  }
}
