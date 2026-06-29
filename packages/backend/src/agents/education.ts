/**
 * HATCH Education Agent — portfolio/market lessons for children.
 * Grounded facts only; Redis template cache by (asset, direction, ageBand).
 */
import { z } from "zod";
import { getAiClient } from "../clients/ai/index.js";
import { getSoSoValueClient } from "../clients/sosovalue.js";
import { getPrisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { redisGet, redisSet } from "../lib/redis.js";

const lessonSchema = z.object({
  title: z
    .string()
    .min(3)
    .max(120)
    .refine((s) => !/https?:\/\//i.test(s), "no urls in title"),
  body: z
    .string()
    .min(20)
    .max(2000)
    .refine(
      (s) => !/\b(guaranteed returns?|you should (buy|sell)|leverage trading)\b/i.test(s),
      "no trading advice language",
    ),
  readingLevel: z.number().int().min(1).max(5),
});

export type LessonKind =
  | "portfolio_delta"
  | "market_event"
  | "manual"
  | "age_intro";

export type LessonDirection = "up" | "down" | "flat" | "event";

function ageBand(ageYears: number): string {
  if (ageYears <= 8) return "6-8";
  if (ageYears <= 12) return "9-12";
  return "13-17";
}

export function lessonCacheKey(input: {
  asset: string;
  direction: LessonDirection;
  ageBand: string;
  kind: LessonKind;
}): string {
  return `hatch:lesson:tpl:${input.kind}:${input.asset}:${input.direction}:${input.ageBand}`;
}

export function directionFromDelta(delta: number | null | undefined): LessonDirection {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return "flat";
  if (delta > 0.01) return "up";
  if (delta < -0.01) return "down";
  return "flat";
}

async function readTemplateCache(key: string): Promise<z.infer<typeof lessonSchema> | null> {
  try {
    const raw = await redisGet(key);
    if (!raw) return null;
    const parsed = lessonSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function writeTemplateCache(
  key: string,
  lesson: z.infer<typeof lessonSchema>,
): Promise<void> {
  try {
    await redisSet(key, JSON.stringify(lesson), 6 * 60 * 60);
  } catch (err) {
    logger.warn({ err: String(err) }, "lesson cache write failed");
  }
}

export async function generateLessonForChild(input: {
  childId: string;
  triggerDelta?: number;
  kind?: LessonKind;
  asset?: string;
  marketEvent?: { name: string; summary: string };
  skipCache?: boolean;
}): Promise<{ id: string; status: string; cacheHit?: boolean }> {
  const prisma = getPrisma();
  const child = await prisma.child.findUnique({ where: { id: input.childId } });
  if (!child) throw new Error("child not found");

  const kind = input.kind ?? (input.marketEvent ? "market_event" : "portfolio_delta");
  const asset = (input.asset ?? "portfolio").toUpperCase();
  const direction = input.marketEvent
    ? ("event" as const)
    : directionFromDelta(input.triggerDelta);
  const band = ageBand(child.ageYears);
  const cacheKey = lessonCacheKey({
    asset,
    direction,
    ageBand: band,
    kind,
  });

  if (!input.skipCache) {
    const cached = await readTemplateCache(cacheKey);
    if (cached) {
      const lesson = await prisma.lesson.create({
        data: {
          childId: child.id,
          status: "READY",
          title: cached.title,
          body: cached.body,
          readingLevel: Math.min(5, Math.max(1, child.readingLevel)),
          citationsJson: {
            cacheHit: true,
            cacheKey,
            kind,
            asset,
            direction,
          },
          triggerDelta: input.triggerDelta,
          model: "cache:template",
        },
      });
      await prisma.agentLog.create({
        data: {
          agent: "education",
          childId: child.id,
          ok: true,
          detail: { lessonId: lesson.id, cacheHit: true, cacheKey },
        },
      });
      return { id: lesson.id, status: lesson.status, cacheHit: true };
    }
  }

  const snapshot = await getSoSoValueClient().marketSnapshot().catch(() => null);
  const promptFacts = {
    childAge: child.ageYears,
    ageBand: band,
    readingLevel: child.readingLevel,
    riskTier: child.riskTier,
    kind,
    asset,
    direction,
    triggerDelta: input.triggerDelta ?? null,
    marketEvent: input.marketEvent ?? null,
    marketSnapshotPresent: !!snapshot,
    marketSnapshot: snapshot,
    rules: [
      "Use ONLY provided facts",
      "Never invent prices, yields, or trades",
      "No trading advice",
      "Age-appropriate tone",
    ],
  };

  try {
    const { data, meta } = await getAiClient().chatJson<z.infer<typeof lessonSchema>>({
      messages: [
        {
          role: "system",
          content:
            "You are the HATCH Education Agent. Explain portfolio/market moves to a child using ONLY the provided facts. Never invent prices, yields, or trades. Return JSON: {title, body, readingLevel}. Keep body short, warm, and age-appropriate. No trading advice. No URLs.",
        },
        {
          role: "user",
          content: JSON.stringify(promptFacts),
        },
      ],
      temperature: 0.3,
      maxTokens: 500,
      reasoning: "none",
    });
    const parsed = lessonSchema.parse(data);
    // Clamp reading level toward child's band
    const readingLevel = Math.min(
      5,
      Math.max(1, Math.round((parsed.readingLevel + child.readingLevel) / 2)),
    );
    const finalLesson = { ...parsed, readingLevel };

    await writeTemplateCache(cacheKey, finalLesson);

    const lesson = await prisma.lesson.create({
      data: {
        childId: child.id,
        status: "READY",
        title: finalLesson.title,
        body: finalLesson.body,
        readingLevel: finalLesson.readingLevel,
        citationsJson: {
          marketSnapshot: !!snapshot,
          provider: meta.providerId,
          cacheHit: false,
          cacheKey,
          kind,
          asset,
          direction,
          marketEvent: input.marketEvent?.name ?? null,
        },
        triggerDelta: input.triggerDelta,
        model: `${meta.providerId}:${meta.model}`,
      },
    });
    await prisma.agentLog.create({
      data: {
        agent: "education",
        childId: child.id,
        ok: true,
        detail: {
          lessonId: lesson.id,
          latencyMs: meta.latencyMs,
          cacheHit: false,
        },
      },
    });
    return { id: lesson.id, status: lesson.status, cacheHit: false };
  } catch (err) {
    logger.error({ err, childId: child.id }, "education lesson failed");
    const lesson = await prisma.lesson.create({
      data: {
        childId: child.id,
        status: "FAILED",
        title: "Unavailable",
        body: "We could not generate a lesson right now. Try again later.",
        readingLevel: child.readingLevel,
        citationsJson: { kind, asset, direction },
        error: err instanceof Error ? err.message : String(err),
      },
    });
    await prisma.agentLog.create({
      data: {
        agent: "education",
        childId: child.id,
        ok: false,
        detail: { error: err instanceof Error ? err.message : String(err) },
      },
    });
    return { id: lesson.id, status: lesson.status, cacheHit: false };
  }
}

/** Market-event lesson for a child (SoSoValue-grounded summary only). */
export async function generateMarketEventLesson(input: {
  childId: string;
  asset: string;
  eventName: string;
  eventSummary: string;
}): Promise<{ id: string; status: string; cacheHit?: boolean }> {
  return generateLessonForChild({
    childId: input.childId,
    kind: "market_event",
    asset: input.asset,
    marketEvent: { name: input.eventName, summary: input.eventSummary },
  });
}
