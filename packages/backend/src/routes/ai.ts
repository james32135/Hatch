import type { FastifyInstance } from "fastify";
import { getAiClient } from "../clients/ai/index.js";
import { HatchError } from "../lib/errors.js";
import { getEnv } from "../config/env.js";
import { assertChildAccess, requireParent } from "../lib/childAccess.js";

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/ai/health",
    async () => {
      return {
        providers: getAiClient().health(),
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
}
