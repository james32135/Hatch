/**
 * Investment Copilot — answers grounded in live SoDEX + portfolio APIs only.
 * Never invents balances, fills, or market depth.
 */
import type { HatchProfile } from "../config/environment.js";
import { getAiClient } from "../clients/ai/index.js";
import {
  scanExecutableMarkets,
  type MarketSnapshot,
} from "./marketLiquidity.js";
import { createSodexClient } from "../clients/sodex.js";
import { getPrisma } from "../lib/prisma.js";
import { HatchError } from "../lib/errors.js";
import { redisGet, redisSet } from "../lib/redis.js";

const QUICK_PROMPTS = [
  "What is the best investment for my child right now?",
  "Should I buy MAG7 today?",
  "Why wasn't my last order filled?",
  "What should I invest in with $10?",
  "Show today's market summary",
  "Explain the family portfolio",
  "Which market has the best ask liquidity?",
  "Compare MAG7 vs USSI liquidity",
] as const;

const AGENT_MARKETS_CACHE_SEC = 45;

export type AgentProgressStep =
  | "markets"
  | "portfolio"
  | "orders"
  | "context"
  | "thinking"
  | "writing";

export type AgentProgressEvent = {
  step: AgentProgressStep;
  label: string;
  status: "active" | "done";
  detail?: string;
};

export type AgentStreamEvent =
  | { type: "progress"; data: AgentProgressEvent }
  | { type: "thinking"; data: { delta: string } }
  | { type: "token"; data: { delta: string } }
  | {
      type: "done";
      data: {
        content: string;
        thinking: string;
        sources: string[];
        followUps: string[];
        marketsTop: unknown[];
        provider: string;
        model: string;
        latencyMs: number;
        contextMs: number;
      };
    }
  | { type: "error"; data: { message: string } };

export function agentQuickPrompts() {
  return [...QUICK_PROMPTS];
}

/** Parse $20 / 20 dollars from user text for routing scan. */
export function parseNotionalUsd(text: string): number | null {
  const m = text.match(/\$\s*(\d+(?:\.\d{1,2})?)/) ?? text.match(/(\d+(?:\.\d{1,2})?)\s*dollars?/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function cachedMarketScan(
  profile: HatchProfile,
  notionalUsd: number,
): Promise<MarketSnapshot[]> {
  const cacheKey = `agent:markets:${profile.id}:${notionalUsd || 0}`;
  try {
    const hit = await redisGet(cacheKey);
    if (hit) return JSON.parse(hit) as MarketSnapshot[];
  } catch {
    /* cache optional */
  }
  const markets = await scanExecutableMarkets(profile, { notionalUsd });
  try {
    await redisSet(cacheKey, JSON.stringify(markets), AGENT_MARKETS_CACHE_SEC);
  } catch {
    /* cache optional */
  }
  return markets;
}

function summarizeMarkets(markets: MarketSnapshot[]) {
  return markets.slice(0, 12).map((m) => ({
    symbol: m.symbol,
    score: m.score,
    executable: m.executable,
    bestAsk: m.bestAsk,
    bestBid: m.bestBid,
    askDepthUsd: Number(m.askDepthUsd.toFixed(2)),
    rejectReasons: m.rejectReasons,
    minNotional: m.minNotional,
  }));
}

export async function buildAgentContext(input: {
  profile: HatchProfile;
  parentId: string;
  childId?: string;
  wallet?: string;
  notionalUsd?: number | null;
  onProgress?: (ev: AgentProgressEvent) => void;
}): Promise<{
  contextText: string;
  sources: string[];
  marketsTop: unknown[];
  portfolio: unknown;
  recentOrders: unknown[];
  contextMs: number;
}> {
  const started = Date.now();
  const emit = (ev: AgentProgressEvent) => input.onProgress?.(ev);
  const sources: string[] = [
    "SoDEX GET /markets/symbols",
    "SoDEX GET /markets/tickers",
    "SoDEX GET /markets/{symbol}/orderbook",
  ];
  const notional = input.notionalUsd ?? 0;

  emit({
    step: "markets",
    label: "Reading live SoDEX markets",
    status: "active",
    detail: notional > 0 ? `Routing ~$${notional} notional` : undefined,
  });

  const marketsPromise = cachedMarketScan(input.profile, notional);

  const portfolioPromise = (async () => {
    if (!input.childId || !input.wallet) return null;
    emit({
      step: "portfolio",
      label: "Loading family portfolio",
      status: "active",
    });
    const client = createSodexClient(input.profile);
    const [accountState, accountBalances] = await Promise.all([
      client.accountState(input.wallet).catch(() => null),
      client.accountBalances(input.wallet).catch(() => null),
    ]);
    const { buildPortfolioEngineView } = await import("./portfolioEngine.js");
    const view = await buildPortfolioEngineView({
      childId: input.childId,
      parentId: input.parentId,
      parentWallet: input.wallet,
      accountState,
      accountBalances,
      profileId: input.profile.id,
    });
    emit({ step: "portfolio", label: "Loading family portfolio", status: "done" });
    sources.push("HATCH portfolio engine ← SoDEX balances/state");
    return view;
  })();

  const ordersPromise = (async () => {
    emit({ step: "orders", label: "Checking recent orders", status: "active" });
    const rows = await getPrisma().signedOrder.findMany({
      where: {
        parentId: input.parentId,
        ...(input.childId ? { childId: input.childId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        clOrdId: true,
        sodexOrderId: true,
        symbolName: true,
        status: true,
        quantity: true,
        price: true,
        error: true,
        createdAt: true,
        sodexResponseJson: true,
      },
    });
    emit({ step: "orders", label: "Checking recent orders", status: "done" });
    sources.push("HATCH signed_orders + SoDEX verification JSON");
    return rows;
  })();

  const [markets, portfolio, recentOrders] = await Promise.all([
    marketsPromise,
    portfolioPromise,
    ordersPromise,
  ]);

  emit({
    step: "markets",
    label: "Reading live SoDEX markets",
    status: "done",
    detail: `${markets.filter((m) => m.executable).length} executable`,
  });

  const marketsTop = summarizeMarkets(markets);
  const mag = markets.find((m) => /vMAG7ssi_vUSDC/i.test(m.symbol));

  emit({ step: "context", label: "Building grounded context", status: "active" });

  const contextText = [
    `Network profile: ${input.profile.id} chainId=${input.profile.chainId}`,
    `Executable markets: ${markets.filter((m) => m.executable).length}/${markets.length}`,
    mag
      ? `MAG7: executable=${mag.executable} asks=${mag.askDepthLevels} bestAsk=${mag.bestAsk} reasons=${mag.rejectReasons.join(",")}`
      : "MAG7: not listed",
    `Top markets JSON: ${JSON.stringify(marketsTop)}`,
    portfolio
      ? `FAMILY SPOT ACCOUNT JSON (parent-owned; never call this the child's portfolio): ${JSON.stringify({
          holdings: (portfolio as { holdings?: unknown }).holdings,
          performance: (portfolio as { performance?: unknown }).performance,
          allocation: (portfolio as { allocation?: unknown }).allocation,
          projection: (portfolio as { projection?: unknown }).projection,
        }).slice(0, 5000)}`
      : "Portfolio: not requested",
    `Recent orders JSON: ${JSON.stringify(recentOrders).slice(0, 3500)}`,
    "Rules: Never invent fills, balances, or ask depth. If data is missing, say so. Prefer executable markets. Path A = SoDEX vault tokens, not Base SSI site auto-update.",
  ]
    .filter(Boolean)
    .join("\n\n");

  emit({ step: "context", label: "Building grounded context", status: "done" });

  return {
    contextText,
    sources,
    marketsTop,
    portfolio,
    recentOrders,
    contextMs: Date.now() - started,
  };
}

function buildSystemPrompt(contextText: string) {
  return {
    role: "system" as const,
    content: `You are HATCH Investment Copilot — a calm, expert family-investing advisor.

Rules:
- Use ONLY the live context below. Never invent fills, balances, ask depth, or prices.
- If data is missing, say so clearly.
- If MAG7/USSI has empty asks, say so and point to executable alternatives from the scan.
- Path A = SoDEX vault tokens on ValueChain. Base SSI site does not auto-update from Path A fills.
- Prefer executable markets. Cite which source you used.
- Portfolio context is the parent's shared family SoDEX spot account. Never describe it as child-owned or allocated.
- childId attributes the allowance plan, orders, and lessons only; HATCH has no child allocation ledger.
- Be concise — lead with the answer, then evidence. Target under 250 words unless comparing many options.

Response shape for recommendations (markdown):
1. Direct answer (1-2 sentences)
2. Reason
3. Evidence (numbers from context)
4. Risk
5. Alternatives
6. Confidence + data freshness

Tone: natural, professional, advisor-like — never robotic.

CONTEXT:
${contextText}`,
  };
}

function followUpsFor(lastUser: string) {
  return agentQuickPrompts()
    .filter((p) => !lastUser.toLowerCase().includes(p.slice(0, 12).toLowerCase()))
    .slice(0, 4);
}

export async function runInvestmentAgent(input: {
  profile: HatchProfile;
  parentId: string;
  childId?: string;
  wallet?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  notionalUsd?: number | null;
}): Promise<{
  content: string;
  sources: string[];
  followUps: string[];
  marketsTop: unknown[];
  provider: string;
  model: string;
  latencyMs: number;
  contextMs: number;
}> {
  if (!input.messages.length) {
    throw new HatchError("invalid_body", "messages required", 400);
  }
  const lastUser =
    [...input.messages].reverse().find((m) => m.role === "user")?.content || "";
  const notional =
    input.notionalUsd ?? parseNotionalUsd(lastUser);

  const ctx = await buildAgentContext({
    ...input,
    notionalUsd: notional,
  });
  const system = buildSystemPrompt(ctx.contextText);
  const result = await getAiClient().chat({
    messages: [system, ...input.messages],
    maxTokens: 768,
  });
  const followUps = followUpsFor(lastUser);

  await getPrisma().agentLog.create({
    data: {
      agent: "investment_copilot",
      childId: input.childId,
      ok: true,
      detail: {
        sources: ctx.sources,
        provider: result.providerId,
        model: result.model,
        latencyMs: result.latencyMs,
        contextMs: ctx.contextMs,
      },
    },
  });

  return {
    content: result.content ?? "",
    sources: ctx.sources,
    followUps,
    marketsTop: ctx.marketsTop,
    provider: result.providerId,
    model: result.model,
    latencyMs: result.latencyMs,
    contextMs: ctx.contextMs,
  };
}

/** SSE-friendly agent run — emits progress, thinking, and answer tokens. */
export async function runInvestmentAgentStream(
  input: {
    profile: HatchProfile;
    parentId: string;
    childId?: string;
    wallet?: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    notionalUsd?: number | null;
  },
  send: (ev: AgentStreamEvent) => void,
): Promise<void> {
  try {
    if (!input.messages.length) {
      throw new HatchError("invalid_body", "messages required", 400);
    }
    const lastUser =
      [...input.messages].reverse().find((m) => m.role === "user")?.content || "";
    const notional =
      input.notionalUsd ?? parseNotionalUsd(lastUser);

    const ctx = await buildAgentContext({
      ...input,
      notionalUsd: notional,
      onProgress: (p) => send({ type: "progress", data: p }),
    });

    send({
      type: "progress",
      data: {
        step: "thinking",
        label: "Analyzing with Copilot",
        status: "active",
      },
    });

    const system = buildSystemPrompt(ctx.contextText);
    const aiStarted = Date.now();
    let wroteToken = false;

    const result = await getAiClient().streamChatEvents(
      {
        messages: [system, ...input.messages],
        maxTokens: 768,
        reasoning: "none",
      },
      (chunk) => {
        if (chunk.type === "thinking" && chunk.text) {
          send({ type: "thinking", data: { delta: chunk.text } });
          return;
        }
        if (chunk.type === "token" && chunk.text) {
          if (!wroteToken) {
            send({
              type: "progress",
              data: {
                step: "thinking",
                label: "Analyzing with Copilot",
                status: "done",
              },
            });
            send({
              type: "progress",
              data: {
                step: "writing",
                label: "Writing answer",
                status: "active",
              },
            });
            wroteToken = true;
          }
          send({ type: "token", data: { delta: chunk.text } });
        }
      },
    );

    send({
      type: "progress",
      data: { step: "writing", label: "Writing answer", status: "done" },
    });

    const followUps = followUpsFor(lastUser);
    const latencyMs = Date.now() - aiStarted;

    await getPrisma().agentLog.create({
      data: {
        agent: "investment_copilot",
        childId: input.childId,
        ok: true,
        detail: {
          sources: ctx.sources,
          provider: result.providerId,
          model: result.model,
          latencyMs,
          contextMs: ctx.contextMs,
          streamed: true,
        },
      },
    });

    send({
      type: "done",
      data: {
        content: result.text,
        thinking: result.thinking,
        sources: ctx.sources,
        followUps,
        marketsTop: ctx.marketsTop,
        provider: result.providerId,
        model: result.model,
        latencyMs,
        contextMs: ctx.contextMs,
      },
    });
  } catch (err) {
    const message =
      err instanceof HatchError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    send({ type: "error", data: { message } });
    try {
      await getPrisma().agentLog.create({
        data: {
          agent: "investment_copilot",
          childId: input.childId,
          ok: false,
          detail: { error: message, streamed: true },
        },
      });
    } catch {
      /* best-effort log */
    }
  }
}
