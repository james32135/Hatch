import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "../src/clients/ai/circuitBreaker.js";
import { parseAiRateLimitCooldownMs } from "../src/clients/ai/index.js";
import {
  isRateLimitError,
  rateLimitBackoffSec,
} from "../src/jobs/queue.js";
import { HatchError } from "../src/lib/errors.js";

describe("rate-limit resilience helpers", () => {
  it("detects SoSoValue / Hatch rate-limit errors", () => {
    expect(isRateLimitError(new HatchError("rate_limited", "SoSoValue rate limited", 429))).toBe(
      true,
    );
    expect(isRateLimitError(new Error("SoSoValue rate limited"))).toBe(true);
    expect(isRateLimitError(new Error("boom"))).toBe(false);
  });

  it("backs off market_sync retries instead of tight-looping", () => {
    expect(rateLimitBackoffSec(1)).toBeGreaterThanOrEqual(60);
    expect(rateLimitBackoffSec(2)).toBeGreaterThan(rateLimitBackoffSec(1));
    expect(rateLimitBackoffSec(5)).toBeLessThanOrEqual(600);
  });

  it("parses Groq TPD 429 into a long circuit cooldown", () => {
    const msg =
      "429 Rate limit reached for model `llama-3.3-70b-versatile` on tokens per day (TPD): Limit 100000, Used 99555, Requested 748. Please try again in 4m21.792s.";
    const ms = parseAiRateLimitCooldownMs(msg);
    expect(ms).toBeGreaterThanOrEqual(15 * 60_000);
  });

  it("parses generic 429 with retry-after seconds", () => {
    const ms = parseAiRateLimitCooldownMs("429 status code (no body)");
    expect(ms).toBeGreaterThanOrEqual(60_000);
  });

  it("trips circuit breaker for custom cooldown", () => {
    const b = new CircuitBreaker("groq", 3, 60_000);
    expect(b.allow()).toBe(true);
    b.trip(120_000);
    expect(b.getState()).toBe("open");
    expect(b.allow()).toBe(false);
    expect(b.snapshot().openUntil).toBeGreaterThan(Date.now());
  });
});
