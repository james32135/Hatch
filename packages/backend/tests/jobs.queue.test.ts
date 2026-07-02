import { describe, expect, it } from "vitest";
import { config } from "dotenv";
import { resolve } from "node:path";
import {
  enqueueJob,
  dequeueJob,
  requeueOrDeadLetter,
  peekDlq,
  type JobPayload,
} from "../src/jobs/queue.js";
import { redisRequired, redisPing } from "../src/lib/redis.js";

config({ path: resolve(process.cwd(), "../../.env") });
if (!process.env.SOSO_API_KEY && process.env.SoSoValue_API_key) {
  process.env.SOSO_API_KEY = process.env.SoSoValue_API_key;
}

describe("job queue + DLQ (live Redis)", () => {
  it("enqueues, dequeues, and DLQs after max attempts", async () => {
    redisRequired();
    expect(await redisPing()).toBe(true);

    const marker = `dlq-path-${Date.now()}`;
    const job = await enqueueJob("retry_drain", { test: marker }, 2);
    expect(job.id).toBeTruthy();

    // Pull until we find our job (other scheduled jobs may be ahead)
    let pulled: JobPayload | null = null;
    for (let i = 0; i < 30; i++) {
      const j = await dequeueJob();
      if (!j) break;
      if (j.id === job.id || j.data?.test === marker) {
        pulled = j;
        break;
      }
      // put unrelated job back
      const { redisLPush } = await import("../src/lib/redis.js");
      await redisLPush("hatch:jobs:queue", JSON.stringify(j));
    }
    expect(pulled?.id).toBe(job.id);

    let cur: JobPayload = { ...pulled!, maxAttempts: 2, attempts: 0 };
    let outcome = await requeueOrDeadLetter(cur, new Error("fail-1"));
    expect(outcome).toBe("requeued");

    let again: JobPayload | null = null;
    for (let i = 0; i < 30; i++) {
      const j = await dequeueJob();
      if (!j) break;
      if (j.id === job.id) {
        again = j;
        break;
      }
      const { redisLPush } = await import("../src/lib/redis.js");
      await redisLPush("hatch:jobs:queue", JSON.stringify(j));
    }
    expect(again?.id).toBe(job.id);
    cur = { ...again!, maxAttempts: 2 };
    outcome = await requeueOrDeadLetter(cur, new Error("fail-2"));
    expect(outcome).toBe("dlq");

    const dlq = await peekDlq(20);
    expect(dlq.some((j) => j.id === job.id)).toBe(true);
  }, 45_000);
});
