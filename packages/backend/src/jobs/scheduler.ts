/**
 * Background job orchestration.
 * - Redis list queue + DLQ (Upstash REST production path)
 * - Distributed schedule gates so multi-instance deploys don't stampede
 * - In-process poller drains queue; BullMQ optional when REDIS_URL TCP present
 */
import { getEnv } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { redisBackend } from "../lib/redis.js";
import { processOneJob, scheduleNamedJobs } from "./workers.js";
import { queueDepths } from "./queue.js";

let scheduleTimer: NodeJS.Timeout | null = null;
let drainTimer: NodeJS.Timeout | null = null;
let cleanupKickTimer: NodeJS.Timeout | null = null;

export function startBackgroundJobs(): void {
  if (scheduleTimer) return;
  const env = getEnv();

  // Enqueue gated jobs on an interval
  scheduleTimer = setInterval(() => {
    void scheduleNamedJobs().catch((err) =>
      logger.warn({ err: String(err) }, "scheduleNamedJobs failed"),
    );
  }, Math.min(env.SNAPSHOT_INTERVAL_MS, 30_000));

  // Drain queue frequently
  drainTimer = setInterval(() => {
    void drainBatch().catch((err) =>
      logger.warn({ err: String(err) }, "job drain failed"),
    );
  }, 5_000);

  // Immediate first schedule
  void scheduleNamedJobs().catch((err) =>
    logger.warn({ err: String(err) }, "initial schedule failed"),
  );

  cleanupKickTimer = setInterval(
    () => {
      void scheduleNamedJobs().catch(() => undefined);
    },
    60 * 60 * 1000,
  );

  logger.info(
    {
      snapshotMs: env.SNAPSHOT_INTERVAL_MS,
      redis: redisBackend(),
      mode: "redis-queue+dlq",
      note:
        redisBackend() === "upstash-rest"
          ? "Upstash REST job coordinator (BullMQ needs REDIS_URL TCP)"
          : "ioredis list queue",
    },
    "background jobs started",
  );
}

export function stopBackgroundJobs(): void {
  if (scheduleTimer) clearInterval(scheduleTimer);
  if (drainTimer) clearInterval(drainTimer);
  if (cleanupKickTimer) clearInterval(cleanupKickTimer);
  scheduleTimer = null;
  drainTimer = null;
  cleanupKickTimer = null;
}

async function drainBatch(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const worked = await processOneJob();
    if (!worked) break;
  }
}

export async function jobsStatus() {
  return queueDepths();
}
