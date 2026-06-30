/**
 * Redis cache — Upstash REST (preferred) or REDIS_URL via ioredis.
 * Production requires one of these; no silent degrade when configured.
 */
import { Redis as UpstashRedis } from "@upstash/redis";
import { Redis as IoRedis } from "ioredis";
import { logger } from "./logger.js";

type Backend = "upstash-rest" | "ioredis";

let upstash: UpstashRedis | null = null;
let ioredis: IoRedis | null = null;
let backend: Backend | null = null;
let initError: string | null = null;

function init(): void {
  if (backend || initError) return;

  const restUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/^"|"$/g, "");
  const restToken = process.env.UPSTASH_REDIS_REST_TOKEN?.replace(/^"|"$/g, "");
  if (restUrl && restToken) {
    upstash = new UpstashRedis({ url: restUrl, token: restToken });
    backend = "upstash-rest";
    logger.info({ backend }, "redis connected (Upstash REST)");
    return;
  }

  const url = process.env.REDIS_URL?.replace(/^"|"$/g, "");
  if (url) {
    ioredis = new IoRedis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
    });
    ioredis.on("error", (err: Error) => {
      logger.warn({ err: String(err) }, "redis error");
    });
    backend = "ioredis";
    logger.info({ backend }, "redis connected (REDIS_URL)");
    return;
  }

  initError = "UPSTASH_REDIS_REST_URL+TOKEN or REDIS_URL required";
  logger.error(initError);
}

export function redisRequired(): void {
  init();
  if (!backend) {
    throw new Error(initError ?? "Redis not configured");
  }
}

export function redisBackend(): Backend | null {
  init();
  return backend;
}

export async function redisGet(key: string): Promise<string | null> {
  init();
  if (!backend) throw new Error(initError ?? "Redis not configured");
  try {
    if (backend === "upstash-rest" && upstash) {
      const v = await upstash.get<string>(key);
      if (v === null || v === undefined) return null;
      return typeof v === "string" ? v : JSON.stringify(v);
    }
    if (ioredis) {
      if (ioredis.status !== "ready") await ioredis.connect().catch(() => undefined);
      return await ioredis.get(key);
    }
  } catch (err) {
    logger.warn({ err: String(err), key }, "redisGet failed");
    throw err;
  }
  return null;
}

export async function redisSet(
  key: string,
  value: string,
  ttlSeconds?: number,
): Promise<void> {
  init();
  if (!backend) throw new Error(initError ?? "Redis not configured");
  if (backend === "upstash-rest" && upstash) {
    if (ttlSeconds && ttlSeconds > 0) {
      await upstash.set(key, value, { ex: ttlSeconds });
    } else {
      await upstash.set(key, value);
    }
    return;
  }
  if (ioredis) {
    if (ioredis.status !== "ready") await ioredis.connect().catch(() => undefined);
    if (ttlSeconds && ttlSeconds > 0) {
      await ioredis.set(key, value, "EX", ttlSeconds);
    } else {
      await ioredis.set(key, value);
    }
  }
}

export async function redisDel(key: string): Promise<void> {
  init();
  if (!backend) throw new Error(initError ?? "Redis not configured");
  if (backend === "upstash-rest" && upstash) {
    await upstash.del(key);
    return;
  }
  if (ioredis) {
    if (ioredis.status !== "ready") await ioredis.connect().catch(() => undefined);
    await ioredis.del(key);
  }
}

export async function redisPing(): Promise<boolean> {
  init();
  if (!backend) return false;
  try {
    if (backend === "upstash-rest" && upstash) {
      const pong = await upstash.ping();
      return pong === "PONG" || pong === "pong" || !!pong;
    }
    if (ioredis) {
      if (ioredis.status !== "ready") await ioredis.connect();
      return (await ioredis.ping()) === "PONG";
    }
  } catch (err) {
    logger.warn({ err: String(err) }, "redis ping failed");
    return false;
  }
  return false;
}

/** @deprecated use redisBackend — kept for any ioredis-only callers */
export function getRedis(): IoRedis | null {
  init();
  return ioredis;
}

/** List push (head). Used by job queue / DLQ. */
export async function redisLPush(key: string, ...values: string[]): Promise<number> {
  init();
  if (!backend) throw new Error(initError ?? "Redis not configured");
  if (backend === "upstash-rest" && upstash) {
    return Number(await upstash.lpush(key, ...values));
  }
  if (ioredis) {
    if (ioredis.status !== "ready") await ioredis.connect().catch(() => undefined);
    return ioredis.lpush(key, ...values);
  }
  throw new Error("Redis not configured");
}

/** List pop (tail). */
export async function redisRPop(key: string): Promise<string | null> {
  init();
  if (!backend) throw new Error(initError ?? "Redis not configured");
  if (backend === "upstash-rest" && upstash) {
    const v = await upstash.rpop<string>(key);
    if (v === null || v === undefined) return null;
    return typeof v === "string" ? v : JSON.stringify(v);
  }
  if (ioredis) {
    if (ioredis.status !== "ready") await ioredis.connect().catch(() => undefined);
    return ioredis.rpop(key);
  }
  return null;
}

export async function redisLLen(key: string): Promise<number> {
  init();
  if (!backend) throw new Error(initError ?? "Redis not configured");
  if (backend === "upstash-rest" && upstash) {
    return Number(await upstash.llen(key));
  }
  if (ioredis) {
    if (ioredis.status !== "ready") await ioredis.connect().catch(() => undefined);
    return ioredis.llen(key);
  }
  return 0;
}

export async function redisLRange(
  key: string,
  start: number,
  stop: number,
): Promise<string[]> {
  init();
  if (!backend) throw new Error(initError ?? "Redis not configured");
  if (backend === "upstash-rest" && upstash) {
    const rows = await upstash.lrange<string>(key, start, stop);
    return (rows ?? []).map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
  }
  if (ioredis) {
    if (ioredis.status !== "ready") await ioredis.connect().catch(() => undefined);
    return ioredis.lrange(key, start, stop);
  }
  return [];
}

export async function redisLTrim(
  key: string,
  start: number,
  stop: number,
): Promise<void> {
  init();
  if (!backend) throw new Error(initError ?? "Redis not configured");
  if (backend === "upstash-rest" && upstash) {
    await upstash.ltrim(key, start, stop);
    return;
  }
  if (ioredis) {
    if (ioredis.status !== "ready") await ioredis.connect().catch(() => undefined);
    await ioredis.ltrim(key, start, stop);
  }
}

/**
 * Distributed lock via SET NX EX.
 * Returns true if lock acquired.
 */
export async function redisAcquireLock(
  key: string,
  token: string,
  ttlSeconds: number,
): Promise<boolean> {
  init();
  if (!backend) throw new Error(initError ?? "Redis not configured");
  if (backend === "upstash-rest" && upstash) {
    const r = await upstash.set(key, token, { nx: true, ex: ttlSeconds });
    return r === "OK";
  }
  if (ioredis) {
    if (ioredis.status !== "ready") await ioredis.connect().catch(() => undefined);
    const r = await ioredis.set(key, token, "EX", ttlSeconds, "NX");
    return r === "OK";
  }
  return false;
}

export async function redisReleaseLock(
  key: string,
  token: string,
): Promise<void> {
  const cur = await redisGet(key);
  if (cur === token) await redisDel(key);
}
