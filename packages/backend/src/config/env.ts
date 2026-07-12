import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));

/** Load nearest .env without overwriting already-set process.env values. */
function loadEnvFiles(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
    resolve(here, "../../../../.env"),
    resolve(here, "../../../.env"),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      loadDotenv({ path: p, override: false });
    }
  }
}

loadEnvFiles();

/** Accept legacy alias SoSoValue_API_key → SOSO_API_KEY */
if (!process.env.SOSO_API_KEY && process.env.SoSoValue_API_key) {
  process.env.SOSO_API_KEY = process.env.SoSoValue_API_key;
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(10000),
  HOST: z.string().default("0.0.0.0"),
  LOG_LEVEL: z.string().default("info"),
  HATCH_DEFAULT_PROFILE: z
    .enum(["mainnet", "testnet", "mainnet-readonly"])
    .default("testnet"),
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  FRONTEND_URL: z.string().default("http://localhost:5173"),

  JWT_SECRET: z.string().min(16),
  JWT_TTL_SECONDS: z.coerce.number().default(604800),
  CRON_SECRET: z.string().min(8).optional(),
  KILL_SWITCH: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
  TRADING_MAX_NOTIONAL_USD: z.coerce.number().default(100),
  TRADING_ALLOWLIST: z.string().optional().default(""),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),

  /**
   * INTERNAL ENGINEERING SoDEX test credentials ONLY.
   * Never used for production parent trading. Parents sign their own orders.
   */
  SODEX_PRIVATE_KEY: z.string().optional(),
  SODEX_ADDRESS: z.string().optional(),
  SODEX_ACCOUNT_ID: z.coerce.number().optional(),

  SOSO_API_BASE_URL: z.string().default("https://openapi.sosovalue.com/openapi/v1"),
  SOSO_API_KEY: z.string().min(1),
  SOSO_RATE_LIMIT_PER_MIN: z.coerce.number().default(18),
  SOSO_CACHE_TTL_SNAPSHOT_SECONDS: z.coerce.number().default(30),

  NVIDIA_API_KEY: z.string().optional(),
  NVIDIA_BASE_URL: z.string().default("https://integrate.api.nvidia.com/v1"),
  NVIDIA_MODEL: z.string().default("deepseek-ai/deepseek-v4-flash"),
  NVIDIA_MODEL_ALT: z.string().default("openai/gpt-oss-120b"),
  NVIDIA_MODEL_ALT2: z.string().default("meta/llama-3.3-70b-instruct"),

  /** Explicit provider preference — matched first when key is present (openai, anthropic, gemini, groq, deepseek, openrouter, nvidia, …) */
  AI_PROVIDER: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().default("https://api.openai.com/v1"),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5-20251001"),

  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-2.0-flash"),

  DEEPSEEK_API_KEY: z.string().optional(),
  DEEPSEEK_BASE_URL: z.string().default("https://api.deepseek.com/v1"),
  DEEPSEEK_MODEL: z.string().default("deepseek-chat"),

  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_BASE_URL: z.string().default("https://openrouter.ai/api/v1"),
  OPENROUTER_MODEL: z.string().default("meta-llama/llama-3.3-70b-instruct:free"),

  GROQ_API_KEY: z.string().optional(),
  GROQ_BASE_URL: z.string().default("https://api.groq.com/openai/v1"),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),

  CEREBRAS_API_KEY: z.string().optional(),
  CEREBRAS_BASE_URL: z.string().default("https://api.cerebras.ai/v1"),
  CEREBRAS_MODEL: z.string().default("llama3.3-70b"),

  SAMBANOVA_API_KEY: z.string().optional(),
  SAMBANOVA_BASE_URL: z.string().default("https://api.sambanova.ai/v1"),
  SAMBANOVA_MODEL: z.string().default("Meta-Llama-3.3-70B-Instruct"),

  TOGETHER_API_KEY: z.string().optional(),
  TOGETHER_BASE_URL: z.string().default("https://api.together.xyz/v1"),
  TOGETHER_MODEL: z.string().default("meta-llama/Llama-3.3-70B-Instruct-Turbo"),

  MISTRAL_API_KEY: z.string().optional(),
  MISTRAL_BASE_URL: z.string().default("https://api.mistral.ai/v1"),
  MISTRAL_MODEL: z.string().default("mistral-small-latest"),

  XAI_API_KEY: z.string().optional(),
  XAI_BASE_URL: z.string().default("https://api.x.ai/v1"),
  XAI_MODEL: z.string().default("grok-2-latest"),

  OLLAMA_BASE_URL: z.string().optional(),
  OLLAMA_MODEL: z.string().default("llama3.3"),

  AI_TIMEOUT_MS: z.coerce.number().default(45000),
  AI_MAX_TOKENS: z.coerce.number().default(1024),
  AI_CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().default(3),
  AI_CIRCUIT_COOLDOWN_MS: z.coerce.number().default(60000),
  AI_MAX_RETRIES_PER_PROVIDER: z.coerce.number().default(2),

  SNAPSHOT_INTERVAL_MS: z.coerce.number().default(60000),
});

export type HatchEnv = z.infer<typeof envSchema>;

let cached: HatchEnv | null = null;

export function getEnv(): HatchEnv {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  const d = parsed.data;
  const hasAiKey = Boolean(
    d.NVIDIA_API_KEY ||
      d.OPENAI_API_KEY ||
      d.ANTHROPIC_API_KEY ||
      d.GEMINI_API_KEY ||
      d.GROQ_API_KEY ||
      d.DEEPSEEK_API_KEY ||
      d.OPENROUTER_API_KEY ||
      d.CEREBRAS_API_KEY ||
      d.SAMBANOVA_API_KEY ||
      d.TOGETHER_API_KEY ||
      d.MISTRAL_API_KEY ||
      d.XAI_API_KEY ||
      d.OLLAMA_BASE_URL,
  );
  if (!hasAiKey) {
    throw new Error(
      "At least one AI provider is required (OPENAI, ANTHROPIC, GEMINI, GROQ, DEEPSEEK, OPENROUTER, NVIDIA, …)",
    );
  }
  if (
    !parsed.data.REDIS_URL &&
    !(parsed.data.UPSTASH_REDIS_REST_URL && parsed.data.UPSTASH_REDIS_REST_TOKEN)
  ) {
    throw new Error(
      "Redis required: set UPSTASH_REDIS_REST_URL+UPSTASH_REDIS_REST_TOKEN or REDIS_URL",
    );
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache(): void {
  cached = null;
}
