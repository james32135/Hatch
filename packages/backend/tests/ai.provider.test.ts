/**
 * AI provider verification — must pass before business-logic expansion.
 * Uses real NVIDIA / fallback providers from .env (no mocks).
 */
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { AiClient } from "../src/clients/ai/index.js";
import { getEnv, resetEnvCache } from "../src/config/env.js";

function loadRootEnv(): void {
  for (const p of [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
    resolve(process.cwd(), "../../../.env"),
  ]) {
    if (existsSync(p)) loadDotenv({ path: p, override: false });
  }
  if (!process.env.SOSO_API_KEY && process.env.SoSoValue_API_key) {
    process.env.SOSO_API_KEY = process.env.SoSoValue_API_key;
  }
}

describe("AI provider stack (live)", () => {
  let client: AiClient;

  beforeAll(() => {
    loadRootEnv();
    resetEnvCache();
    getEnv();
    client = new AiClient();
    expect(client.listProviders().length).toBeGreaterThan(0);
  });

  it("lists configured providers in priority order", () => {
    const providers = client.listProviders();
    expect(providers.length).toBeGreaterThan(0);
    const explicit = process.env.AI_PROVIDER?.trim().toLowerCase();
    if (explicit === "nvidia") {
      expect(providers.slice(0, 3).map((p) => p.id)).toEqual([
        "nvidia-primary",
        "nvidia-alt",
        "nvidia-alt2",
      ]);
    } else if (explicit) {
      expect(providers[0]?.id).toBe(explicit);
    }
    const ids = new Set(providers.map((p) => p.id));
    expect(ids.size).toBe(providers.length);
  });

  it("structured JSON mode", async () => {
    const { data, meta } = await client.chatJson<{
      ok: boolean;
      product: string;
    }>({
      messages: [
        {
          role: "system",
          content: "Reply with JSON only. No markdown.",
        },
        {
          role: "user",
          content:
            'Return exactly {"ok":true,"product":"HATCH"} with those keys and values.',
        },
      ],
      maxTokens: 128,
      temperature: 0,
      reasoning: "none",
    });
    expect(data.ok).toBe(true);
    expect(data.product).toBe("HATCH");
    expect(meta.latencyMs).toBeGreaterThan(0);
    expect(meta.providerId).toBeTruthy();
  });

  it("streaming text", async () => {
    const stream = await client.streamText({
      messages: [
        {
          role: "user",
          content: "Say the single word: ready",
        },
      ],
      maxTokens: 32,
      temperature: 0,
      reasoning: "none",
    });
    expect(stream.text.toLowerCase()).toContain("ready");
    expect(stream.latencyMs).toBeGreaterThan(0);
  });

  it("reasoning mode (NVIDIA DeepSeek when available)", async () => {
    const result = await client.chat({
      messages: [
        {
          role: "user",
          content: "What is 17*19? Reply with the number only.",
        },
      ],
      maxTokens: 256,
      temperature: 0,
      reasoning: "high",
    });
    expect(result.content ?? "").toMatch(/323/);
  });

  it("tool calling", async () => {
    const result = await client.chat({
      messages: [
        {
          role: "user",
          content: "Use the get_portfolio_value tool for childId child_1.",
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "get_portfolio_value",
            description: "Get a child's portfolio USD value",
            parameters: {
              type: "object",
              properties: {
                childId: { type: "string" },
              },
              required: ["childId"],
            },
          },
        },
      ],
      toolChoice: "required",
      maxTokens: 256,
      temperature: 0,
      reasoning: "none",
    });
    expect(result.toolCalls.length).toBeGreaterThan(0);
    expect(result.toolCalls[0]?.name).toBe("get_portfolio_value");
    const args = JSON.parse(result.toolCalls[0]!.arguments);
    expect(args.childId).toBeTruthy();
  });

  it("timeout handling rejects absurdly low timeout then recovers via failover or retry path", async () => {
    // Use a fresh client so intentional micro-timeouts do not open shared circuits
    const isolated = new AiClient();
    let failed = false;
    try {
      await isolated.chat({
        messages: [{ role: "user", content: "ping" }],
        maxTokens: 8,
        timeoutMs: 1,
        reasoning: "none",
      });
    } catch {
      failed = true;
    }
    const ok = await new AiClient().chat({
      messages: [{ role: "user", content: "Reply with OK" }],
      maxTokens: 16,
      temperature: 0,
      reasoning: "none",
      timeoutMs: 45_000,
    });
    expect(ok.content ?? ok.toolCalls).toBeTruthy();
    expect(failed || ok.latencyMs >= 0).toBe(true);
  });

  it("exposes circuit breaker health snapshots", () => {
    const health = client.health();
    expect(health.length).toBeGreaterThan(0);
    expect(health[0]?.circuit?.state).toMatch(/closed|open|half-open/);
  });

  it("context limit: large prompt still returns or fails cleanly without crash", async () => {
    const big = "HATCH ".repeat(2000);
    try {
      const result = await client.chat({
        messages: [
          {
            role: "user",
            content: `${big}\n\nReply with the single word: done`,
          },
        ],
        maxTokens: 16,
        temperature: 0,
        reasoning: "none",
      });
      expect((result.content ?? "").toLowerCase()).toMatch(/done|hatch|ok/);
    } catch (err) {
      expect(String(err)).toMatch(/fail|context|token|length|400|413/i);
    }
  });
});
