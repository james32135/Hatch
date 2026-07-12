import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { getEnv, type HatchEnv } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { CircuitBreaker } from "./circuitBreaker.js";

export type AiProviderId =
  | "nvidia-primary"
  | "nvidia-alt"
  | "nvidia-alt2"
  | "groq"
  | "cerebras"
  | "sambanova";

export interface AiProviderConfig {
  id: AiProviderId;
  label: string;
  apiKey: string;
  baseURL: string;
  model: string;
}

export interface ChatRequest {
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  toolChoice?: "auto" | "none" | "required";
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  /** DeepSeek V4 Flash reasoning via NVIDIA chat_template_kwargs */
  reasoning?: "none" | "high" | "max";
  timeoutMs?: number;
}

export interface ChatResult {
  providerId: AiProviderId;
  model: string;
  content: string | null;
  toolCalls: Array<{ id: string; name: string; arguments: string }>;
  latencyMs: number;
  finishReason: string | null;
  raw?: unknown;
}

export type StreamChunk = { type: "token" | "thinking"; text: string };

export type StreamChatResult = {
  text: string;
  thinking: string;
  providerId: AiProviderId;
  model: string;
  latencyMs: number;
};

function buildProviders(env: HatchEnv): AiProviderConfig[] {
  const list: AiProviderConfig[] = [];
  if (env.NVIDIA_API_KEY) {
    list.push({
      id: "nvidia-primary",
      label: "NVIDIA DeepSeek V4 Flash",
      apiKey: env.NVIDIA_API_KEY,
      baseURL: env.NVIDIA_BASE_URL,
      model: env.NVIDIA_MODEL,
    });
    list.push({
      id: "nvidia-alt",
      label: "NVIDIA gpt-oss-120b",
      apiKey: env.NVIDIA_API_KEY,
      baseURL: env.NVIDIA_BASE_URL,
      model: env.NVIDIA_MODEL_ALT,
    });
    list.push({
      id: "nvidia-alt2",
      label: "NVIDIA Llama 3.3 70B",
      apiKey: env.NVIDIA_API_KEY,
      baseURL: env.NVIDIA_BASE_URL,
      model: env.NVIDIA_MODEL_ALT2,
    });
  }
  if (env.GROQ_API_KEY) {
    list.push({
      id: "groq",
      label: "Groq",
      apiKey: env.GROQ_API_KEY,
      baseURL: env.GROQ_BASE_URL,
      model: env.GROQ_MODEL,
    });
  }
  if (env.CEREBRAS_API_KEY) {
    list.push({
      id: "cerebras",
      label: "Cerebras",
      apiKey: env.CEREBRAS_API_KEY,
      baseURL: env.CEREBRAS_BASE_URL,
      model: env.CEREBRAS_MODEL,
    });
  }
  if (env.SAMBANOVA_API_KEY) {
    list.push({
      id: "sambanova",
      label: "SambaNova",
      apiKey: env.SAMBANOVA_API_KEY,
      baseURL: env.SAMBANOVA_BASE_URL,
      model: env.SAMBANOVA_MODEL,
    });
  }
  return list;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class AiClient {
  private readonly providers: AiProviderConfig[];
  private readonly breakers: Map<AiProviderId, CircuitBreaker>;
  private readonly env: HatchEnv;

  constructor(env?: HatchEnv) {
    this.env = env ?? getEnv();
    this.providers = buildProviders(this.env);
    this.breakers = new Map(
      this.providers.map((p) => [
        p.id,
        new CircuitBreaker(
          p.id,
          this.env.AI_CIRCUIT_FAILURE_THRESHOLD,
          this.env.AI_CIRCUIT_COOLDOWN_MS,
        ),
      ]),
    );
  }

  listProviders(): AiProviderConfig[] {
    return [...this.providers];
  }

  health() {
    return this.providers.map((p) => ({
      ...p,
      apiKey: undefined,
      circuit: this.breakers.get(p.id)?.snapshot(),
    }));
  }

  async chat(req: ChatRequest): Promise<ChatResult> {
    const errors: Array<{ provider: string; error: string }> = [];
    for (const provider of this.providers) {
      const breaker = this.breakers.get(provider.id)!;
      if (!breaker.allow()) {
        errors.push({ provider: provider.id, error: "circuit_open" });
        continue;
      }
      const maxAttempts = this.env.AI_MAX_RETRIES_PER_PROVIDER;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await this.callProvider(provider, req);
          breaker.recordSuccess();
          return result;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.warn(
            { provider: provider.id, attempt, message },
            "ai provider call failed",
          );
          errors.push({ provider: provider.id, error: message });
          const retryable = /timeout|429|5\d\d|ECONN|fetch|network|rate/i.test(message);
          if (!retryable || attempt === maxAttempts) {
            breaker.recordFailure();
            break;
          }
          await sleep(250 * attempt);
        }
      }
    }
    throw new Error(
      `All AI providers failed: ${errors.map((e) => `${e.provider}=${e.error}`).join(" | ")}`,
    );
  }

  async chatJson<T = unknown>(
    req: Omit<ChatRequest, "jsonMode" | "stream">,
  ): Promise<{ data: T; meta: ChatResult }> {
    const meta = await this.chat({ ...req, jsonMode: true, stream: false });
    if (!meta.content) throw new Error("Empty JSON content from AI");
    const cleaned = meta.content.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const data = JSON.parse(cleaned) as T;
    return { data, meta };
  }

  async streamText(req: Omit<ChatRequest, "stream">): Promise<{
    text: string;
    providerId: AiProviderId;
    model: string;
    latencyMs: number;
  }> {
    const started = Date.now();
    const errors: string[] = [];
    for (const provider of this.providers) {
      const breaker = this.breakers.get(provider.id)!;
      if (!breaker.allow()) continue;
      try {
        const client = new OpenAI({
          apiKey: provider.apiKey,
          baseURL: provider.baseURL,
          timeout: req.timeoutMs ?? this.env.AI_TIMEOUT_MS,
        });
        const extra = this.extraBody(provider, req) ?? {};
        const stream = (await client.chat.completions.create({
          model: provider.model,
          messages: req.messages,
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens ?? this.env.AI_MAX_TOKENS,
          stream: true,
          ...(req.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
          ...extra,
        })) as AsyncIterable<{
          choices: Array<{
            delta?: {
              content?: string | null;
              reasoning_content?: string | null;
            };
          }>;
        }>;
        let text = "";
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          text += delta?.content ?? "";
          // Some NVIDIA DeepSeek streams put interim tokens in reasoning_content
          if (!delta?.content && delta?.reasoning_content) {
            text += delta.reasoning_content;
          }
        }
        if (!text.trim()) {
          // Fallback: non-stream completion if provider streamed empty deltas
          const fallback = await this.callProvider(provider, {
            ...req,
            stream: false,
          });
          text = fallback.content ?? "";
        }
        if (!text.trim()) {
          throw new Error("empty stream content");
        }
        breaker.recordSuccess();
        return {
          text,
          providerId: provider.id,
          model: provider.model,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        breaker.recordFailure();
        errors.push(`${provider.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new Error(`Stream failed on all providers: ${errors.join(" | ")}`);
  }

  /** Stream tokens + optional thinking deltas to caller; returns full text at end. */
  async streamChatEvents(
    req: Omit<ChatRequest, "stream">,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<StreamChatResult> {
    const started = Date.now();
    const errors: string[] = [];
    for (const provider of this.providers) {
      const breaker = this.breakers.get(provider.id)!;
      if (!breaker.allow()) continue;
      try {
        const client = new OpenAI({
          apiKey: provider.apiKey,
          baseURL: provider.baseURL,
          timeout: req.timeoutMs ?? this.env.AI_TIMEOUT_MS,
        });
        const extra = this.extraBody(provider, req) ?? {};
        const stream = (await client.chat.completions.create({
          model: provider.model,
          messages: req.messages,
          temperature: req.temperature ?? 0.2,
          max_tokens: req.maxTokens ?? this.env.AI_MAX_TOKENS,
          stream: true,
          ...(req.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
          ...extra,
        })) as AsyncIterable<{
          choices: Array<{
            delta?: {
              content?: string | null;
              reasoning_content?: string | null;
            };
          }>;
        }>;
        let text = "";
        let thinking = "";
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          if (delta?.reasoning_content) {
            thinking += delta.reasoning_content;
            onChunk({ type: "thinking", text: delta.reasoning_content });
          }
          if (delta?.content) {
            text += delta.content;
            onChunk({ type: "token", text: delta.content });
          }
        }
        if (!text.trim()) {
          const fallback = await this.callProvider(provider, {
            ...req,
            stream: false,
          });
          text = fallback.content ?? "";
          if (text) onChunk({ type: "token", text });
        }
        if (!text.trim()) throw new Error("empty stream content");
        breaker.recordSuccess();
        return {
          text,
          thinking,
          providerId: provider.id,
          model: provider.model,
          latencyMs: Date.now() - started,
        };
      } catch (err) {
        breaker.recordFailure();
        errors.push(`${provider.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    throw new Error(`Stream failed on all providers: ${errors.join(" | ")}`);
  }

  private extraBody(provider: AiProviderConfig, req: ChatRequest): Record<string, unknown> | undefined {
    if (!provider.id.startsWith("nvidia")) return undefined;
    if (!provider.model.includes("deepseek")) return undefined;
    const effort = req.reasoning ?? "none";
    if (effort === "none") {
      return { chat_template_kwargs: { thinking: false } };
    }
    return {
      chat_template_kwargs: {
        thinking: true,
        reasoning_effort: effort,
      },
    };
  }

  private async callProvider(
    provider: AiProviderConfig,
    req: ChatRequest,
  ): Promise<ChatResult> {
    const started = Date.now();
    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseURL,
      timeout: req.timeoutMs ?? this.env.AI_TIMEOUT_MS,
    });
    const extra = this.extraBody(provider, req) ?? {};
    const completion = (await client.chat.completions.create({
      model: provider.model,
      messages: req.messages,
      temperature: req.temperature ?? 0.2,
      max_tokens: req.maxTokens ?? this.env.AI_MAX_TOKENS,
      stream: false,
      ...(req.tools
        ? { tools: req.tools, tool_choice: req.toolChoice ?? "auto" }
        : {}),
      ...(req.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
      ...extra,
    })) as {
      choices: Array<{
        message?: {
          content?: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason?: string | null;
      }>;
    };
    const choice = completion.choices[0];
    const toolCalls =
      choice?.message?.tool_calls?.map(
        (t: { id: string; function: { name: string; arguments: string } }) => ({
          id: t.id,
          name: t.function.name,
          arguments: t.function.arguments,
        }),
      ) ?? [];
    return {
      providerId: provider.id,
      model: provider.model,
      content: choice?.message?.content ?? null,
      toolCalls,
      latencyMs: Date.now() - started,
      finishReason: choice?.finish_reason ?? null,
      raw: completion,
    };
  }
}

let singleton: AiClient | null = null;

export function getAiClient(): AiClient {
  if (!singleton) singleton = new AiClient();
  return singleton;
}
