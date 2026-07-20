/**
 * Redis-backed job queue with retries + dead-letter.
 *
 * Production uses Upstash REST (no TCP REDIS_URL) — BullMQ requires Redis
 * protocol, so this coordinator is the production path. When REDIS_URL is
 * present, the same list semantics work via ioredis; optional BullMQ bridge
 * can be layered later without changing job names/payloads.
 */
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { getPrisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import {
  redisLLen,
  redisLPush,
  redisLRange,
  redisLTrim,
  redisRPop,
  redisSet,
  redisGet,
} from "../lib/redis.js";

export type JobName =
  | "portfolio_sync"
  | "market_sync"
  | "allowance_scheduler"
  | "lesson_generation"
  | "cleanup"
  | "retry_drain"
  | "order_fill_verify";

export interface JobPayload {
  id: string;
  name: JobName;
  data: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  lastError?: string;
  /** ISO timestamp — worker must not run the job before this time. */
  availableAt?: string;
}

export function isRateLimitError(err: unknown): boolean {
  if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "rate_limited") {
    return true;
  }
  const message = err instanceof Error ? err.message : String(err ?? "");
  return /rate.?limit|429|SoSoValue rate limited|tokens per day|\bTPD\b/i.test(message);
}

/** Backoff seconds for rate-limit retries: 60 → 180 → 420 (capped). */
export function rateLimitBackoffSec(attempts: number): number {
  const n = Math.max(1, attempts);
  return Math.min(60 * (1 + n * (n + 1) / 2), 600);
}

const QUEUE_KEY = "hatch:jobs:queue";
const DLQ_KEY = "hatch:jobs:dlq";
const STATS_PREFIX = "hatch:jobs:stats:";

const DEFAULT_MAX_ATTEMPTS = 3;

export async function enqueueJob(
  name: JobName,
  data: Record<string, unknown> = {},
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): Promise<JobPayload> {
  const job: JobPayload = {
    id: randomUUID(),
    name,
    data,
    attempts: 0,
    maxAttempts,
    createdAt: new Date().toISOString(),
  };
  await redisLPush(QUEUE_KEY, JSON.stringify(job));
  await bumpStat("enqueued");
  logger.debug({ jobId: job.id, name }, "job enqueued");
  return job;
}

export async function dequeueJob(): Promise<JobPayload | null> {
  const raw = await redisRPop(QUEUE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as JobPayload;
  } catch {
    logger.warn({ raw: raw.slice(0, 200) }, "corrupt job payload → DLQ");
    await pushDlq({
      id: randomUUID(),
      name: "cleanup",
      data: { corrupt: raw.slice(0, 500) },
      attempts: 99,
      maxAttempts: 1,
      createdAt: new Date().toISOString(),
      lastError: "corrupt_json",
    });
    return null;
  }
}

export async function requeueOrDeadLetter(
  job: JobPayload,
  err: unknown,
): Promise<"requeued" | "dlq"> {
  const message = err instanceof Error ? err.message : String(err);
  job.attempts += 1;
  job.lastError = message.slice(0, 500);

  const rateLimited = isRateLimitError(err);
  // Rate limits get more attempts + delayed availability so we don't hammer APIs.
  const maxAttempts = rateLimited
    ? Math.max(job.maxAttempts, 5)
    : job.maxAttempts;

  if (job.attempts >= maxAttempts) {
    await pushDlq(job);
    await bumpStat("dlq");
    await getPrisma().systemEvent.create({
      data: {
        kind: "job_dlq",
        payload: {
          jobId: job.id,
          name: job.name,
          attempts: job.attempts,
          lastError: job.lastError,
          data: job.data,
          rateLimited,
        } as Prisma.InputJsonValue,
      },
    });
    logger.error(
      { jobId: job.id, name: job.name, attempts: job.attempts, err: message },
      "job moved to DLQ",
    );
    return "dlq";
  }

  if (rateLimited) {
    const delaySec = rateLimitBackoffSec(job.attempts);
    job.availableAt = new Date(Date.now() + delaySec * 1000).toISOString();
    await redisLPush(QUEUE_KEY, JSON.stringify(job));
    await bumpStat("retried");
    logger.warn(
      {
        jobId: job.id,
        name: job.name,
        attempts: job.attempts,
        delaySec,
        availableAt: job.availableAt,
        err: message,
      },
      "job requeued with rate-limit backoff",
    );
    return "requeued";
  }

  // Transient errors: short stagger so drain loop doesn't tight-loop.
  job.availableAt = new Date(Date.now() + 5_000 * job.attempts).toISOString();
  await redisLPush(QUEUE_KEY, JSON.stringify(job));
  await bumpStat("retried");
  logger.warn(
    { jobId: job.id, name: job.name, attempts: job.attempts, err: message },
    "job requeued",
  );
  return "requeued";
}

async function pushDlq(job: JobPayload): Promise<void> {
  await redisLPush(DLQ_KEY, JSON.stringify(job));
  // Cap DLQ length
  await redisLTrim(DLQ_KEY, 0, 199);
}

export async function peekDlq(limit = 20): Promise<JobPayload[]> {
  const rows = await redisLRange(DLQ_KEY, 0, limit - 1);
  return rows
    .map((r) => {
      try {
        return JSON.parse(r) as JobPayload;
      } catch {
        return null;
      }
    })
    .filter((j): j is JobPayload => !!j);
}

export async function queueDepths(): Promise<{
  queue: number;
  dlq: number;
  stats: Record<string, number>;
}> {
  const [queue, dlq, enqueued, completed, failed, retried, dlqStat] =
    await Promise.all([
      redisLLen(QUEUE_KEY),
      redisLLen(DLQ_KEY),
      readStat("enqueued"),
      readStat("completed"),
      readStat("failed"),
      readStat("retried"),
      readStat("dlq"),
    ]);
  return {
    queue,
    dlq,
    stats: { enqueued, completed, failed, retried, dlq: dlqStat },
  };
}

async function bumpStat(name: string): Promise<void> {
  const key = `${STATS_PREFIX}${name}`;
  const cur = Number((await redisGet(key)) ?? "0");
  await redisSet(key, String(cur + 1), 86_400);
}

async function readStat(name: string): Promise<number> {
  return Number((await redisGet(`${STATS_PREFIX}${name}`)) ?? "0");
}

export async function markJobCompleted(job: JobPayload): Promise<void> {
  await bumpStat("completed");
  await getPrisma().systemEvent.create({
    data: {
      kind: "job_completed",
      payload: { jobId: job.id, name: job.name, attempts: job.attempts },
    },
  });
}
