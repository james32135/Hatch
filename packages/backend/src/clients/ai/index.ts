import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { getEnv, type HatchEnv } from "../../config/env.js";
import { logger } from "../../lib/logger.js";
import { CircuitBreaker } from "./circuitBreaker.js";

export type AiProviderId =
  | "openai"
  | "anthropic"
  | "gemini"
  | "groq"
  | "deepseek"
  | "openrouter"
  | "nvidia-primary"
  | "nvidia-alt"
  | "nvidia-alt2"
  | "cerebras"
  | "sambanova"
  | "together"
  | "mistral"
  | "xai"
  | "ollama";

export type AiProviderKind = "openai" | "anthropic" | "gemini";

export interface AiProviderConfig {
  id: AiProviderId;
  label: string;
  kind: AiProviderKind;
  apiKey: string;
  model: string;
  baseURL?: string;
}

export interface ChatRequest {
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  toolChoice?: "auto" | "none" | "required";
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
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

const DEFAULT_PRIORITY: AiProviderId[] = [
  "openai",
  "anthropic",
  "gemini",
  "groq",
  "deepseek",
  "openrouter",
  "nvidia-primary",
  "nvidia-alt",
  "nvidia-alt2",
  "cerebras",
  "sambanova",
  "together",
  "mistral",
  "xai",
  "ollama",
];

function pushOpenAi(
  list: AiProviderConfig[],
  id: AiProviderId,
  label: string,
  apiKey: string | undefined,
  baseURL: string,
  model: string,
): void {
  if (!apiKey) return;
  list.push({ id, label, kind: "openai", apiKey, baseURL, model });
}

/** Collect every configured provider (unordered). */
export function collectConfiguredProviders(env: HatchEnv): AiProviderConfig[] {
  const list: AiProviderConfig[] = [];

  pushOpenAi(list, "openai", "OpenAI", env.OPENAI_API_KEY, env.OPENAI_BASE_URL, env.OPENAI_MODEL);

  if (env.ANTHROPIC_API_KEY) {
    list.push({
      id: "anthropic",
      label: "Anthropic",
      kind: "anthropic",
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
    });
  }

  if (env.GEMINI_API_KEY) {
    list.push({
      id: "gemini",
      label: "Google Gemini",
      kind: "gemini",
      apiKey: env.GEMINI_API_KEY,
      model: env.GEMINI_MODEL,
    });
  }

  pushOpenAi(list, "groq", "Groq", env.GROQ_API_KEY, env.GROQ_BASE_URL, env.GROQ_MODEL);
  pushOpenAi(
    list,
    "deepseek",
    "DeepSeek",
    env.DEEPSEEK_API_KEY,
    env.DEEPSEEK_BASE_URL,
    env.DEEPSEEK_MODEL,
  );
  pushOpenAi(
    list,
    "openrouter",
    "OpenRouter",
    env.OPENROUTER_API_KEY,
    env.OPENROUTER_BASE_URL,
    env.OPENROUTER_MODEL,
  );

  if (env.NVIDIA_API_KEY) {
    list.push(
      {
        id: "nvidia-primary",
        label: "NVIDIA DeepSeek V4 Flash",
        kind: "openai",
        apiKey: env.NVIDIA_API_KEY,
        baseURL: env.NVIDIA_BASE_URL,
        model: env.NVIDIA_MODEL,
      },
      {
        id: "nvidia-alt",
        label: "NVIDIA gpt-oss-120b",
        kind: "openai",
        apiKey: env.NVIDIA_API_KEY,
        baseURL: env.NVIDIA_BASE_URL,
        model: env.NVIDIA_MODEL_ALT,
      },
      {
        id: "nvidia-alt2",
        label: "NVIDIA Llama 3.3 70B",
        kind: "openai",
        apiKey: env.NVIDIA_API_KEY,
        baseURL: env.NVIDIA_BASE_URL,
        model: env.NVIDIA_MODEL_ALT2,
      },
    );
  }

  pushOpenAi(
    list,
    "cerebras",
    "Cerebras",
    env.CEREBRAS_API_KEY,
    env.CEREBRAS_BASE_URL,
    env.CEREBRAS_MODEL,
  );
  pushOpenAi(
    list,
    "sambanova",
    "SambaNova",
    env.SAMBANOVA_API_KEY,
    env.SAMBANOVA_BASE_URL,
    env.SAMBANOVA_MODEL,
  );
  pushOpenAi(
    list,
    "together",
    "Together",
    env.TOGETHER_API_KEY,
    env.TOGETHER_BASE_URL,
    env.TOGETHER_MODEL,
  );
  pushOpenAi(
    list,
    "mistral",
    "Mistral",
    env.MISTRAL_API_KEY,
    env.MISTRAL_BASE_URL,
    env.MISTRAL_MODEL,
  );
  pushOpenAi(list, "xai", "xAI", env.XAI_API_KEY, env.XAI_BASE_URL, env.XAI_MODEL);

  if (env.OLLAMA_BASE_URL) {
    list.push({
      id: "ollama",
      label: "Ollama (local)",
      kind: "openai",
      apiKey: "ollama",
      baseURL: env.OLLAMA_BASE_URL.replace(/\/$/, ""),
      model: env.OLLAMA_MODEL,
    });
  }

  return list;
}

/** Order providers: explicit AI_PROVIDER first, then default priority chain. */
export function orderProviders(
  available: AiProviderConfig[],
  explicit?: string | null,
): AiProviderConfig[] {
  const byId = new Map(available.map((p) => [p.id, p]));
  const ordered: AiProviderConfig[] = [];
  const seen = new Set<AiProviderId>();

  const add = (id: AiProviderId) => {
    const p = byId.get(id);
    if (p && !seen.has(id)) {
      ordered.push(p);
      seen.add(id);
    }
  };

  const pref = explicit?.trim().toLowerCase();
  if (pref) {
    if (pref === "nvidia") {
      add("nvidia-primary");
      add("nvidia-alt");
      add("nvidia-alt2");
    } else {
      add(pref as AiProviderId);
    }
  }

  for (const id of DEFAULT_PRIORITY) add(id);
  for (const p of available) add(p.id);

  return ordered;
}

function buildProviders(env: HatchEnv): AiProviderConfig[] {
  return orderProviders(collectConfiguredProviders(env), env.AI_PROVIDER);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function toAnthropicMessages(messages: ChatCompletionMessageParam[]) {
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .filter(Boolean);
  const system = systemParts.join("\n\n") || undefined;
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user" || m.role === "assistant") {
      const text =
        typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content)
            ? m.content.map((c) => ("text" in c ? c.text : "")).join("")
            : "";
      out.push({ role: m.role, content: text });
    }
  }
  return { system, messages: out };
}

function toGeminiContents(messages: ChatCompletionMessageParam[]) {
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .filter(Boolean);
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  if (systemParts.length) {
    contents.push({
      role: "user",
      parts: [{ text: `[System instructions]\n${systemParts.join("\n\n")}` }],
    });
    contents.push({ role: "model", parts: [{ text: "Understood." }] });
  }
  for (const m of messages) {
    if (m.role === "system") continue;
    const text =
      typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((c) => ("text" in c ? c.text : "")).join("")
          : "";
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text }],
    });
  }
  return contents;
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
      id: p.id,
      label: p.label,
      kind: p.kind,
      model: p.model,
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
          logger.warn({ provider: provider.id, attempt, message }, "ai provider call failed");
          errors.push({ provider: provider.id, error: message });
          const retryable = /timeout|429|5\d\d|ECONN|fetch|network|rate|overloaded/i.test(message);
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
    let text = "";
    const result = await this.streamChatEvents(req, (chunk) => {
      if (chunk.type === "token") text += chunk.text;
      else text += chunk.text;
    });
    return {
      text: result.text || text,
      providerId: result.providerId,
      model: result.model,
      latencyMs: Date.now() - started,
    };
  }

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
        const result = await this.streamProvider(provider, req, onChunk);
        breaker.recordSuccess();
        return { ...result, latencyMs: Date.now() - started };
      } catch (err) {
        breaker.recordFailure();
        errors.push(`${provider.id}: ${err instanceof Error ? err.message : String(err)}`);
        logger.warn({ provider: provider.id, err: errors.at(-1) }, "ai stream provider failed, failing over");
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

  private async callProvider(provider: AiProviderConfig, req: ChatRequest): Promise<ChatResult> {
    const started = Date.now();
    if (provider.kind === "anthropic") {
      return this.callAnthropic(provider, req, started);
    }
    if (provider.kind === "gemini") {
      return this.callGemini(provider, req, started);
    }
    return this.callOpenAiCompatible(provider, req, started);
  }

  private async streamProvider(
    provider: AiProviderConfig,
    req: Omit<ChatRequest, "stream">,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<Omit<StreamChatResult, "latencyMs">> {
    if (provider.kind === "anthropic") {
      return this.streamAnthropic(provider, req, onChunk);
    }
    if (provider.kind === "gemini") {
      return this.streamGemini(provider, req, onChunk);
    }
    return this.streamOpenAiCompatible(provider, req, onChunk);
  }

  private async callOpenAiCompatible(
    provider: AiProviderConfig,
    req: ChatRequest,
    started: number,
  ): Promise<ChatResult> {
    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseURL,
      timeout: req.timeoutMs ?? this.env.AI_TIMEOUT_MS,
    });
    const extra = this.extraBody(provider, req) ?? {};
    const headers =
      provider.id === "openrouter"
        ? { "HTTP-Referer": this.env.FRONTEND_URL, "X-Title": "HATCH" }
        : undefined;
    const completion = (await client.chat.completions.create(
      {
        model: provider.model,
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? this.env.AI_MAX_TOKENS,
        stream: false,
        ...(req.tools ? { tools: req.tools, tool_choice: req.toolChoice ?? "auto" } : {}),
        ...(req.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
        ...extra,
      },
      headers ? { headers } : undefined,
    )) as {
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
      choice?.message?.tool_calls?.map((t) => ({
        id: t.id,
        name: t.function.name,
        arguments: t.function.arguments,
      })) ?? [];
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

  private async streamOpenAiCompatible(
    provider: AiProviderConfig,
    req: Omit<ChatRequest, "stream">,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<Omit<StreamChatResult, "latencyMs">> {
    const client = new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.baseURL,
      timeout: req.timeoutMs ?? this.env.AI_TIMEOUT_MS,
    });
    const extra = this.extraBody(provider, req) ?? {};
    const headers =
      provider.id === "openrouter"
        ? { "HTTP-Referer": this.env.FRONTEND_URL, "X-Title": "HATCH" }
        : undefined;
    const stream = (await client.chat.completions.create(
      {
        model: provider.model,
        messages: req.messages,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.maxTokens ?? this.env.AI_MAX_TOKENS,
        stream: true,
        ...(req.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
        ...extra,
      },
      headers ? { headers } : undefined,
    )) as AsyncIterable<{
      choices: Array<{
        delta?: { content?: string | null; reasoning_content?: string | null };
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
      const fallback = await this.callOpenAiCompatible(provider, { ...req, stream: false }, Date.now());
      text = fallback.content ?? "";
      if (text) onChunk({ type: "token", text });
    }
    if (!text.trim()) throw new Error("empty stream content");
    return { text, thinking, providerId: provider.id, model: provider.model };
  }

  private async callAnthropic(
    provider: AiProviderConfig,
    req: ChatRequest,
    started: number,
  ): Promise<ChatResult> {
    const client = new Anthropic({
      apiKey: provider.apiKey,
      timeout: req.timeoutMs ?? this.env.AI_TIMEOUT_MS,
    });
    const { system, messages } = toAnthropicMessages(req.messages);
    const resp = await client.messages.create({
      model: provider.model,
      max_tokens: req.maxTokens ?? this.env.AI_MAX_TOKENS,
      temperature: req.temperature ?? 0.2,
      system,
      messages,
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    return {
      providerId: provider.id,
      model: provider.model,
      content: text || null,
      toolCalls: [],
      latencyMs: Date.now() - started,
      finishReason: resp.stop_reason,
    };
  }

  private async streamAnthropic(
    provider: AiProviderConfig,
    req: Omit<ChatRequest, "stream">,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<Omit<StreamChatResult, "latencyMs">> {
    const client = new Anthropic({
      apiKey: provider.apiKey,
      timeout: req.timeoutMs ?? this.env.AI_TIMEOUT_MS,
    });
    const { system, messages } = toAnthropicMessages(req.messages);
    const stream = client.messages.stream({
      model: provider.model,
      max_tokens: req.maxTokens ?? this.env.AI_MAX_TOKENS,
      temperature: req.temperature ?? 0.2,
      system,
      messages,
    });
    let text = "";
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
        onChunk({ type: "token", text: event.delta.text });
      }
    }
    if (!text.trim()) {
      const fallback = await this.callAnthropic(provider, req, Date.now());
      text = fallback.content ?? "";
      if (text) onChunk({ type: "token", text });
    }
    if (!text.trim()) throw new Error("empty anthropic stream");
    return { text, thinking: "", providerId: provider.id, model: provider.model };
  }

  private async callGemini(
    provider: AiProviderConfig,
    req: ChatRequest,
    started: number,
  ): Promise<ChatResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:generateContent?key=${encodeURIComponent(provider.apiKey)}`;
    const body = {
      contents: toGeminiContents(req.messages),
      generationConfig: {
        temperature: req.temperature ?? 0.2,
        maxOutputTokens: req.maxTokens ?? this.env.AI_MAX_TOKENS,
        ...(req.jsonMode ? { responseMimeType: "application/json" } : {}),
      },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(req.timeoutMs ?? this.env.AI_TIMEOUT_MS),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Gemini ${res.status}: ${errText.slice(0, 200)}`);
    }
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text =
      json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return {
      providerId: provider.id,
      model: provider.model,
      content: text || null,
      toolCalls: [],
      latencyMs: Date.now() - started,
      finishReason: null,
    };
  }

  private async streamGemini(
    provider: AiProviderConfig,
    req: Omit<ChatRequest, "stream">,
    onChunk: (chunk: StreamChunk) => void,
  ): Promise<Omit<StreamChatResult, "latencyMs">> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(provider.apiKey)}`;
    const body = {
      contents: toGeminiContents(req.messages),
      generationConfig: {
        temperature: req.temperature ?? 0.2,
        maxOutputTokens: req.maxTokens ?? this.env.AI_MAX_TOKENS,
      },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(req.timeoutMs ?? this.env.AI_TIMEOUT_MS),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Gemini stream ${res.status}: ${errText.slice(0, 200)}`);
    }
    let text = "";
    const reader = res.body?.getReader();
    if (!reader) throw new Error("Gemini stream body missing");
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const line of parts) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload) as {
            candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          };
          const delta = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
          if (delta) {
            text += delta;
            onChunk({ type: "token", text: delta });
          }
        } catch {
          /* skip malformed chunk */
        }
      }
    }
    if (!text.trim()) {
      const fallback = await this.callGemini(provider, req, Date.now());
      text = fallback.content ?? "";
      if (text) onChunk({ type: "token", text });
    }
    if (!text.trim()) throw new Error("empty gemini stream");
    return { text, thinking: "", providerId: provider.id, model: provider.model };
  }
}

let singleton: AiClient | null = null;

export function getAiClient(): AiClient {
  if (!singleton) singleton = new AiClient();
  return singleton;
}

export function resetAiClient(): void {
  singleton = null;
}
