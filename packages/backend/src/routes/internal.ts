import type { FastifyInstance } from "fastify";
import { getEnv } from "../config/env.js";
import { getPrisma } from "../lib/prisma.js";
import { HatchError } from "../lib/errors.js";
import { redisPing, redisBackend } from "../lib/redis.js";

export async function registerInternalRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/internal/heartbeat", async (req) => {
    const env = getEnv();
    const secret = req.headers["x-cron-secret"];
    if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
      throw new HatchError("unauthorized", "Invalid cron secret", 401);
    }

    const prisma = getPrisma();
    const redisOk = await redisPing();
    const duePolicies = await prisma.allowancePolicy.count({
      where: { paused: false, nextDueAt: { lte: new Date() } },
    });
    const { jobsStatus } = await import("../jobs/scheduler.js");
    const jobs = await jobsStatus().catch(() => null);

    await prisma.systemEvent.create({
      data: {
        kind: "heartbeat",
        payload: {
          at: new Date().toISOString(),
          killSwitch: env.KILL_SWITCH,
          redisOk,
          redisBackend: redisBackend(),
          duePoliciesAwaitingParentSign: duePolicies,
          jobs,
          custody: false,
        },
      },
    });

    return {
      ok: true,
      killSwitch: env.KILL_SWITCH,
      redis: { ok: redisOk, backend: redisBackend() },
      jobs,
      duePoliciesAwaitingParentSign: duePolicies,
      note: duePolicies
        ? "Due allowances await parent EIP-712 sign — backend does not auto-trade"
        : undefined,
    };
  });

  app.get(
    "/api/diag/orders",
    { preHandler: [app.authenticate] },
    async (req) => {
      if (req.user.role !== "parent") {
        throw new HatchError("forbidden", "Parents only", 403);
      }
      const orders = await getPrisma().signedOrder.findMany({
        where: { parentId: req.user.sub },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      return { orders };
    },
  );
}
