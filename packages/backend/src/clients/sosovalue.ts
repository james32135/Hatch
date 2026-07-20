import { getEnv } from "../config/env.js";
import { HatchError } from "../lib/errors.js";
import { redisGet, redisSet } from "../lib/redis.js";
import { logger } from "../lib/logger.js";

/** Shared Redis key — blocks SoSoValue outbound calls across workers. */
export const SOSO_COOLDOWN_KEY = "hatch:soso:cooldown";
const DEFAULT_COOLDOWN_SEC = 300;

export class SoSoValueClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly ratePerMin: number;
  private windowStart = Date.now();
  private windowCount = 0;
  private localCooldownUntil = 0;

  constructor() {
    const env = getEnv();
    this.baseUrl = env.SOSO_API_BASE_URL.replace(/\/$/, "");
    this.apiKey = env.SOSO_API_KEY;
    this.ratePerMin = env.SOSO_RATE_LIMIT_PER_MIN;
  }

  private async throttle(): Promise<void> {
    if (Date.now() < this.localCooldownUntil) {
      throw new HatchError("rate_limited", "SoSoValue rate limited", 429);
    }
    const cool = await redisGet(SOSO_COOLDOWN_KEY);
    if (cool) {
      throw new HatchError("rate_limited", "SoSoValue rate limited", 429);
    }

    const now = Date.now();
    if (now - this.windowStart >= 60_000) {
      this.windowStart = now;
      this.windowCount = 0;
    }
    if (this.windowCount >= this.ratePerMin) {
      const wait = 60_000 - (now - this.windowStart) + 50;
      await new Promise((r) => setTimeout(r, wait));
      this.windowStart = Date.now();
      this.windowCount = 0;
    }
    this.windowCount += 1;
  }

  private async markCooldown(retryAfterSec?: number): Promise<void> {
    const sec = Math.max(
      60,
      Math.min(retryAfterSec && Number.isFinite(retryAfterSec) ? retryAfterSec : DEFAULT_COOLDOWN_SEC, 900),
    );
    this.localCooldownUntil = Date.now() + sec * 1000;
    await redisSet(SOSO_COOLDOWN_KEY, new Date().toISOString(), sec);
    logger.warn({ cooldownSec: sec }, "SoSoValue cooldown armed");
  }

  async get<T = unknown>(path: string, cacheTtlSeconds = 0): Promise<T> {
    const cacheKey = `soso:${path}`;
    if (cacheTtlSeconds > 0) {
      const hit = await redisGet(cacheKey);
      if (hit) return JSON.parse(hit) as T;
    }
    await this.throttle();
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, {
      headers: {
        "x-soso-api-key": this.apiKey,
        accept: "application/json",
      },
    });
    if (res.status === 429) {
      const retryRaw = res.headers.get("retry-after");
      const retryAfterSec = retryRaw ? Number(retryRaw) : undefined;
      await this.markCooldown(retryAfterSec);
      throw new HatchError("rate_limited", "SoSoValue rate limited", 429, {
        retryAfterSec,
      });
    }
    if (!res.ok) {
      const body = await res.text();
      throw new HatchError(
        "unavailable",
        `SoSoValue ${res.status}: ${body.slice(0, 200)}`,
        502,
      );
    }
    const data = (await res.json()) as T;
    if (cacheTtlSeconds > 0) {
      await redisSet(cacheKey, JSON.stringify(data), cacheTtlSeconds);
    }
    return data;
  }

  indices() {
    return this.get("/indices", 300);
  }

  marketSnapshot() {
    const ttl = getEnv().SOSO_CACHE_TTL_SNAPSHOT_SECONDS;
    return this.get("/market-snapshot", ttl);
  }

  mag7Constituents() {
    return this.get("/indices/ssimag7/constituents", 300);
  }
}

let client: SoSoValueClient | null = null;
export function getSoSoValueClient(): SoSoValueClient {
  if (!client) client = new SoSoValueClient();
  return client;
}
