import { describe, expect, it } from "vitest";
import {
  collectConfiguredProviders,
  orderProviders,
} from "../src/clients/ai/index.js";
import type { HatchEnv } from "../src/config/env.js";

function baseEnv(overrides: Partial<HatchEnv> = {}): HatchEnv {
  return {
    NODE_ENV: "test",
    PORT: 10000,
    HOST: "0.0.0.0",
    LOG_LEVEL: "info",
    HATCH_DEFAULT_PROFILE: "testnet",
    CORS_ALLOWED_ORIGINS: "http://localhost:5173",
    FRONTEND_URL: "http://localhost:5173",
    JWT_SECRET: "test-secret-min-16-ch",
    JWT_TTL_SECONDS: 604800,
    KILL_SWITCH: false,
    TRADING_MAX_NOTIONAL_USD: 100,
    TRADING_ALLOWLIST: "",
    DATABASE_URL: "postgresql://x",
    SOSO_API_BASE_URL: "https://openapi.sosovalue.com/openapi/v1",
    SOSO_API_KEY: "soso-test",
    SOSO_RATE_LIMIT_PER_MIN: 18,
    SOSO_CACHE_TTL_SNAPSHOT_SECONDS: 30,
    NVIDIA_BASE_URL: "https://integrate.api.nvidia.com/v1",
    NVIDIA_MODEL: "deepseek-ai/deepseek-v4-flash",
    NVIDIA_MODEL_ALT: "openai/gpt-oss-120b",
    NVIDIA_MODEL_ALT2: "meta/llama-3.3-70b-instruct",
    OPENAI_BASE_URL: "https://api.openai.com/v1",
    OPENAI_MODEL: "gpt-4o-mini",
    ANTHROPIC_MODEL: "claude-haiku-4-5-20251001",
    GEMINI_MODEL: "gemini-2.0-flash",
    DEEPSEEK_BASE_URL: "https://api.deepseek.com/v1",
    DEEPSEEK_MODEL: "deepseek-chat",
    OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
    OPENROUTER_MODEL: "meta-llama/llama-3.3-70b-instruct:free",
    GROQ_BASE_URL: "https://api.groq.com/openai/v1",
    GROQ_MODEL: "llama-3.3-70b-versatile",
    CEREBRAS_BASE_URL: "https://api.cerebras.ai/v1",
    CEREBRAS_MODEL: "llama3.3-70b",
    SAMBANOVA_BASE_URL: "https://api.sambanova.ai/v1",
    SAMBANOVA_MODEL: "Meta-Llama-3.3-70B-Instruct",
    TOGETHER_BASE_URL: "https://api.together.xyz/v1",
    TOGETHER_MODEL: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    MISTRAL_BASE_URL: "https://api.mistral.ai/v1",
    MISTRAL_MODEL: "mistral-small-latest",
    XAI_BASE_URL: "https://api.x.ai/v1",
    XAI_MODEL: "grok-2-latest",
    OLLAMA_MODEL: "llama3.3",
    AI_TIMEOUT_MS: 45000,
    AI_MAX_TOKENS: 1024,
    AI_CIRCUIT_FAILURE_THRESHOLD: 3,
    AI_CIRCUIT_COOLDOWN_MS: 60000,
    AI_MAX_RETRIES_PER_PROVIDER: 2,
    SNAPSHOT_INTERVAL_MS: 60000,
    ...overrides,
  } as HatchEnv;
}

describe("AI provider ordering", () => {
  it("orders explicit AI_PROVIDER first", () => {
    const available = collectConfiguredProviders(
      baseEnv({
        OPENAI_API_KEY: "o",
        GROQ_API_KEY: "g",
        AI_PROVIDER: "groq",
      }),
    );
    const ordered = orderProviders(available, "groq");
    expect(ordered[0]?.id).toBe("groq");
    expect(ordered.some((p) => p.id === "openai")).toBe(true);
  });

  it("expands nvidia explicit preference to all NVIDIA models", () => {
    const available = collectConfiguredProviders(
      baseEnv({
        NVIDIA_API_KEY: "n",
        OPENAI_API_KEY: "o",
        AI_PROVIDER: "nvidia",
      }),
    );
    const ordered = orderProviders(available, "nvidia");
    expect(ordered[0]?.id).toBe("nvidia-primary");
    expect(ordered[1]?.id).toBe("nvidia-alt");
    expect(ordered[2]?.id).toBe("nvidia-alt2");
  });

  it("defaults to OpenAI → Anthropic → Gemini → Groq priority", () => {
    const available = collectConfiguredProviders(
      baseEnv({
        OPENAI_API_KEY: "o",
        ANTHROPIC_API_KEY: "a",
        GEMINI_API_KEY: "g",
        GROQ_API_KEY: "q",
      }),
    );
    const ordered = orderProviders(available, null);
    expect(ordered.slice(0, 4).map((p) => p.id)).toEqual([
      "openai",
      "anthropic",
      "gemini",
      "groq",
    ]);
  });
});
