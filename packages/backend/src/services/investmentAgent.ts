/**
 * Investment Copilot — answers grounded in live SoDEX + portfolio APIs only.
 * Never invents balances, fills, or market depth.
 */
import type { HatchProfile } from "../config/environment.js";
import { getAiClient } from "../clients/ai/index.js";
import { scanExecutableMarkets } from "./marketLiquidity.js";
import { createSodexClient } from "../clients/sodex.js";
import { getPrisma } from "../lib/prisma.js";
import { HatchError } from "../lib/errors.js";

const QUICK_PROMPTS = [
  "What is the best investment for my child right now?",
  "Should I buy MAG7 today?",
  "Why wasn't my last order filled?",
  "What should I invest in with $10?",
  "Show today's market summary",
  "Explain my portfolio",
  "Which market has the best ask liquidity?",
  "Compare MAG7 vs USSI liquidity",
] as const;

export function agentQuickPrompts() {
  return [...QUICK_PROMPTS];
}

export async function buildAgentContext(input: {
  profile: HatchProfile;
  parentId: string;
  childId?: string;
  wallet?: string;
}): Promise<{
  contextText: string;
  sources: string[];
  marketsTop: unknown[];
  portfolio: unknown;
  recentOrders: unknown[];
}> {
  const sources: string[] = [
    "SoDEX GET /markets/symbols",
    "SoDEX GET /markets/tickers",
    "SoDEX GET /markets/{symbol}/orderbook",
  ];
  const markets = await scanExecutableMarkets(input.profile);
  const marketsTop = markets.slice(0, 12).map((m) => ({
    symbol: m.symbol,
    score: m.score,
    executable: m.executable,
    bestAsk: m.bestAsk,
    bestBid: m.bestBid,
    askDepthUsd: Number(m.askDepthUsd.toFixed(2)),
    rejectReasons: m.rejectReasons,
    minNotional: m.minNotional,
  }));

  let portfolio: unknown = null;
  if (input.childId && input.wallet) {
    const client = createSodexClient(input.profile);
    const [accountState, accountBalances] = await Promise.all([
      client.accountState(input.wallet).catch(() => null),
      client.accountBalances(input.wallet).catch(() => null),
    ]);
    const { buildPortfolioEngineView } = await import("./portfolioEngine.js");
    portfolio = await buildPortfolioEngineView({
      childId: input.childId,
      parentId: input.parentId,
      parentWallet: input.wallet,
      accountState,
      accountBalances,
    });
    sources.push("HATCH portfolio engine ← SoDEX balances/state");
  }

  const recentOrders = await getPrisma().signedOrder.findMany({
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
  sources.push("HATCH signed_orders + SoDEX verification JSON");

  let walletBalances: unknown = null;
  if (input.wallet) {
    try {
      walletBalances = await createSodexClient(input.profile).accountBalances(
        input.wallet,
      );
      sources.push("SoDEX GET /accounts/{addr}/balances");
    } catch {
      /* optional */
    }
  }

  const mag = markets.find((m) => /vMAG7ssi_vUSDC/i.test(m.symbol));
  const contextText = [
    `Network profile: ${input.profile.id} chainId=${input.profile.chainId}`,
    `Executable markets: ${markets.filter((m) => m.executable).length}/${markets.length}`,
    mag
      ? `MAG7: executable=${mag.executable} asks=${mag.askDepthLevels} bestAsk=${mag.bestAsk} reasons=${mag.rejectReasons.join(",")}`
      : "MAG7: not listed",
    `Top markets JSON: ${JSON.stringify(marketsTop)}`,
    portfolio
      ? `Portfolio JSON (official-sourced): ${JSON.stringify(portfolio).slice(0, 6000)}`
      : "Portfolio: not requested",
    `Recent orders JSON: ${JSON.stringify(recentOrders).slice(0, 4000)}`,
    walletBalances
      ? `Wallet balances JSON: ${JSON.stringify(walletBalances).slice(0, 2000)}`
      : "",
    "Rules: Never invent fills, balances, or ask depth. If data is missing, say so. Prefer executable markets. Path A = SoDEX vault tokens, not Base SSI site auto-update.",
  ]
    .filter(Boolean)
    .join("\n\n");

  return { contextText, sources, marketsTop, portfolio, recentOrders };
}

export async function runInvestmentAgent(input: {
  profile: HatchProfile;
  parentId: string;
  childId?: string;
  wallet?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{
  content: string;
  sources: string[];
  followUps: string[];
  marketsTop: unknown[];
  provider: string;
  model: string;
  latencyMs: number;
}> {
  if (!input.messages.length) {
    throw new HatchError("invalid_body", "messages required", 400);
  }
  const ctx = await buildAgentContext(input);
  const system = {
    role: "system" as const,
    content: `You are HATCH Investment Copilot for family SoDEX investing. Use ONLY the provided live context. Cite which source you used. Be concise and concrete. If MAG7 has empty asks, say so and point to executable alternatives from the scan.\n\n${ctx.contextText}`,
  };
  const result = await getAiClient().chat({
    messages: [system, ...input.messages],
  });
  const lastUser = [...input.messages].reverse().find((m) => m.role === "user")?.content || "";
  const followUps = agentQuickPrompts()
    .filter((p) => !lastUser.toLowerCase().includes(p.slice(0, 12).toLowerCase()))
    .slice(0, 4);

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
  };
}
