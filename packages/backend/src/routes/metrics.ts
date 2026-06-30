import type { FastifyInstance } from "fastify";
import { getPrisma } from "../lib/prisma.js";
import { redisPing, redisBackend } from "../lib/redis.js";
import { getAiClient } from "../clients/ai/index.js";
import { getEnv } from "../config/env.js";
import { jobsStatus } from "../jobs/scheduler.js";
import { HATCH_CONTRACTS } from "../config/addresses.js";

export async function registerMetricsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/metrics", async () => {
    const prisma = getPrisma();
    const env = getEnv();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      users,
      children,
      orders24h,
      ordersFailed24h,
      lessonsReady24h,
      lessonsFailed24h,
      snapshots24h,
      handoffs24h,
      relays24h,
      heartbeats24h,
      jobDlq24h,
      lastHeartbeat,
      duePolicies,
      redisOk,
      jobs,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.child.count(),
      prisma.signedOrder.count({ where: { createdAt: { gte: since } } }),
      prisma.signedOrder.count({
        where: { createdAt: { gte: since }, status: "FAILED" },
      }),
      prisma.lesson.count({
        where: { createdAt: { gte: since }, status: "READY" },
      }),
      prisma.lesson.count({
        where: { createdAt: { gte: since }, status: "FAILED" },
      }),
      prisma.portfolioSnapshot.count({ where: { createdAt: { gte: since } } }),
      prisma.systemEvent.count({
        where: { kind: "allowance_sign_handoff", createdAt: { gte: since } },
      }),
      prisma.systemEvent.count({
        where: { kind: "sodex_relay", createdAt: { gte: since } },
      }),
      prisma.systemEvent.count({
        where: { kind: "heartbeat", createdAt: { gte: since } },
      }),
      prisma.systemEvent.count({
        where: { kind: "job_dlq", createdAt: { gte: since } },
      }),
      prisma.systemEvent.findFirst({
        where: { kind: "heartbeat" },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      prisma.allowancePolicy.count({
        where: { paused: false, nextDueAt: { lte: new Date() } },
      }),
      redisPing(),
      jobsStatus().catch(() => ({ queue: -1, dlq: -1, stats: {} })),
    ]);

    return {
      service: "hatch-backend",
      profile: env.HATCH_DEFAULT_PROFILE,
      killSwitch: env.KILL_SWITCH,
      custody: { backendOwnsSodexTradingKeys: false },
      redis: { ok: redisOk, backend: redisBackend() },
      jobs,
      contracts: {
        mainnet: HATCH_CONTRACTS.mainnet,
        testnet: HATCH_CONTRACTS.testnet,
        ssiRouterSet: !!HATCH_CONTRACTS.ssiRouter,
      },
      aiProviders: getAiClient().listProviders().map((p) => p.id),
      counts: {
        users,
        children,
        orders24h,
        ordersFailed24h,
        lessonsReady24h,
        lessonsFailed24h,
        snapshots24h,
        handoffs24h,
        relays24h,
        heartbeats24h,
        jobDlq24h,
        duePoliciesAwaitingParentSign: duePolicies,
      },
      lastHeartbeatAt: lastHeartbeat?.createdAt?.toISOString() ?? null,
      mainnetTestGuard: {
        maxUsdc: 1,
        preferredUsdc: 0.2,
        note: "Applies to eng SoDEX test wallet on mainnet only",
      },
      at: new Date().toISOString(),
    };
  });
}
