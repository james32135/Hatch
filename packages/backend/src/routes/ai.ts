import type { FastifyInstance } from "fastify";
import { getAiClient } from "../clients/ai/index.js";
import { HatchError } from "../lib/errors.js";
import { getEnv } from "../config/env.js";
import { assertChildAccess, requireParent } from "../lib/childAccess.js";
import { logger } from "../lib/logger.js";

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/ai/health",
    async () => {
      const client = getAiClient();
      return {
        providers: client.health(),
        configured: client.listProviders().map((p) => p.id),
        priority: client.listProviders().map((p) => ({ id: p.id, label: p.label, model: p.model })),
        explicitProvider: getEnv().AI_PROVIDER ?? null,
        timeoutMs: getEnv().AI_TIMEOUT_MS,
      };
    },
  );

  app.get(
    "/api/lessons/:childId",
    { preHandler: [app.authenticate] },
    async (req) => {
      const { childId } = req.params as { childId: string };
      await assertChildAccess(req, childId);
      const { getPrisma } = await import("../lib/prisma.js");
      const lessons = await getPrisma().lesson.findMany({
        where: { childId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      return { lessons };
    },
  );

  app.post(
    "/api/lessons/:childId/generate",
    { preHandler: [app.authenticate] },
    async (req) => {
      requireParent(req);
      const { childId } = req.params as { childId: string };
      await assertChildAccess(req, childId);
      const body = (req.body ?? {}) as {
        triggerDelta?: number;
        kind?: "portfolio_delta" | "market_event" | "manual" | "age_intro";
        asset?: string;
        marketEvent?: { name: string; summary: string };
        skipCache?: boolean;
      };
      const { generateLessonForChild } = await import("../agents/education.js");
      const result = await generateLessonForChild({
        childId,
        triggerDelta: body.triggerDelta,
        kind: body.kind,
        asset: body.asset,
        marketEvent: body.marketEvent,
        skipCache: body.skipCache,
      });
      return result;
    },
  );

  app.post(
    "/api/ai/chat",
    { preHandler: [app.authenticate] },
    async (req) => {
      requireParent(req);
      const body = req.body as {
        messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
        jsonMode?: boolean;
      };
      if (!body.messages?.length) {
        throw new HatchError("invalid_body", "messages required", 400);
      }
      if (body.jsonMode) {
        const { data, meta } = await getAiClient().chatJson({
          messages: body.messages,
        });
        return { data, provider: meta.providerId, model: meta.model, latencyMs: meta.latencyMs };
      }
      const result = await getAiClient().chat({ messages: body.messages });
      return {
        content: result.content,
        provider: result.providerId,
        model: result.model,
        latencyMs: result.latencyMs,
      };
    },
  );

  /** Investment Copilot — grounded in live SoDEX + portfolio. */
  app.get(
    "/api/ai/agent/prompts",
    { preHandler: [app.authenticate] },
    async () => {
      const { agentQuickPrompts } = await import("../services/investmentAgent.js");
      return { prompts: agentQuickPrompts() };
    },
  );

  app.post(
    "/api/ai/agent",
    { preHandler: [app.authenticate] },
    async (req) => {
      requireParent(req);
      const body = req.body as {
        messages?: Array<{ role: "user" | "assistant"; content: string }>;
        childId?: string;
        notionalUsd?: number;
      };
      if (!body.messages?.length) {
        throw new HatchError("invalid_body", "messages required", 400);
      }
      if (body.childId) {
        await assertChildAccess(req, body.childId);
      }
      const { resolveProfile } = await import("../config/environment.js");
      const { getEnv } = await import("../config/env.js");
      const profile = resolveProfile(
        (req.headers["x-hatch-profile"] as string | undefined) ??
          getEnv().HATCH_DEFAULT_PROFILE,
      );
      const { runInvestmentAgent } = await import("../services/investmentAgent.js");
      return runInvestmentAgent({
        profile,
        parentId: req.user.sub,
        childId: body.childId,
        wallet: req.user.wallet,
        messages: body.messages,
        notionalUsd: body.notionalUsd,
      });
    },
  );

  /** Investment Copilot — SSE progress + token stream. */
  app.post(
    "/api/ai/agent/stream",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const startedAt = Date.now();
      const traceId = req.id;
      requireParent(req);
      const body = req.body as {
        messages?: Array<{ role: "user" | "assistant"; content: string }>;
        childId?: string;
        notionalUsd?: number;
      };
      if (!body.messages?.length) {
        throw new HatchError("invalid_body", "messages required", 400);
      }
      if (body.childId) {
        await assertChildAccess(req, body.childId);
      }
      const { resolveProfile } = await import("../config/environment.js");
      const { getEnv } = await import("../config/env.js");
      const profile = resolveProfile(
        (req.headers["x-hatch-profile"] as string | undefined) ??
          getEnv().HATCH_DEFAULT_PROFILE,
      );

      const origin = req.headers.origin;
      const allowedOrigins = getEnv()
        .CORS_ALLOWED_ORIGINS.split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const accessControlAllowOrigin = allowedOrigins.includes("*")
        ? "*"
        : origin && allowedOrigins.includes(origin)
          ? origin
          : undefined;
      const responseHeaders: Record<string, string> = {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "X-HATCH-Trace-Id": traceId,
        "Access-Control-Expose-Headers": "X-HATCH-Trace-Id",
      };
      if (accessControlAllowOrigin) {
        responseHeaders["Access-Control-Allow-Origin"] =
          accessControlAllowOrigin;
        responseHeaders["Access-Control-Allow-Credentials"] = "true";
        responseHeaders.Vary = "Origin";
      }

      logger.info(
        {
          traceId,
          method: req.method,
          url: req.url,
          origin,
          profile: profile.id,
          role: req.user.role,
          childId: body.childId,
          messageCount: body.messages.length,
          lastUserMessage:
            [...body.messages].reverse().find((message) => message.role === "user")
              ?.content ?? null,
        },
        "copilot stream request started",
      );

      reply.hijack();
      reply.raw.writeHead(200, responseHeaders);

      let eventCount = 0;
      const send = (event: string, data: unknown) => {
        eventCount += 1;
        reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      try {
        const { runInvestmentAgentStream } = await import(
          "../services/investmentAgent.js"
        );

        await runInvestmentAgentStream(
          {
            profile,
            parentId: req.user.sub,
            childId: body.childId,
            wallet: req.user.wallet,
            messages: body.messages,
            notionalUsd: body.notionalUsd,
          },
          (ev) => send(ev.type, ev.data),
        );

        logger.info(
          {
            traceId,
            status: 200,
            eventCount,
            durationMs: Date.now() - startedAt,
          },
          "copilot stream request completed",
        );
      } catch (error) {
        logger.error(
          {
            traceId,
            status: 500,
            eventCount,
            durationMs: Date.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          },
          "copilot stream request failed",
        );
        send("error", {
          message: "Copilot stream failed unexpectedly. Please retry.",
          traceId,
        });
      } finally {
        reply.raw.end();
      }
    },
  );
}
