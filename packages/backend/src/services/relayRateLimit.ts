/**
 * Simple in-memory per-wallet rate limiter for SoDEX relay.
 * Uses Redis when available; otherwise process-local Map.
 */
import { redisGet, redisSet } from "../lib/redis.js";
import { HatchError } from "../lib/errors.js";

const localHits = new Map<string, number[]>();

export async function assertRelayRateLimit(
  wallet: string,
  maxPerMinute = 20,
): Promise<void> {
  const key = `relay:rl:${wallet.toLowerCase()}`;
  const now = Date.now();
  const windowMs = 60_000;

  const cached = await redisGet(key);
  let hits: number[] = cached ? (JSON.parse(cached) as number[]) : [];
  if (!cached) {
    hits = localHits.get(key) ?? [];
  }
  hits = hits.filter((t) => now - t < windowMs);
  if (hits.length >= maxPerMinute) {
    throw new HatchError(
      "rate_limited",
      `Relay rate limit exceeded (${maxPerMinute}/min)`,
      429,
      { wallet: wallet.toLowerCase(), maxPerMinute },
    );
  }
  hits.push(now);
  localHits.set(key, hits);
  await redisSet(key, JSON.stringify(hits), 60);
}
