import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPrisma } from "../lib/prisma.js";
import { HatchError } from "../lib/errors.js";

const createChildSchema = z.object({
  displayName: z.string().min(1).max(64),
  ageYears: z.number().int().min(5).max(17),
  readingLevel: z.number().int().min(1).max(5).optional(),
  riskTier: z.enum(["CONSERVATIVE", "BALANCED", "GROWTH"]).optional(),
});

export async function registerChildrenRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (req) => {
    if (!req.url.startsWith("/api/children")) return;
  });

  app.get(
    "/api/children",
    { preHandler: [app.authenticate] },
    async (req) => {
      if (req.user.role !== "parent") {
        throw new HatchError("forbidden_child_write", "Parents only", 403);
      }
      const children = await getPrisma().child.findMany({
        where: { parentId: req.user.sub },
        orderBy: { createdAt: "asc" },
      });
      return { children };
    },
  );

  app.post(
    "/api/children",
    { preHandler: [app.authenticate] },
    async (req) => {
      if (req.user.role !== "parent") {
        throw new HatchError("forbidden_child_write", "Parents only", 403);
      }
      const parsed = createChildSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HatchError("invalid_body", parsed.error.message, 400);
      }
      const child = await getPrisma().child.create({
        data: {
          parentId: req.user.sub,
          displayName: parsed.data.displayName,
          ageYears: parsed.data.ageYears,
          readingLevel: parsed.data.readingLevel ?? 1,
          riskTier: parsed.data.riskTier ?? "BALANCED",
        },
      });
      return { child };
    },
  );

  app.patch(
    "/api/children/:id",
    { preHandler: [app.authenticate] },
    async (req) => {
      if (req.user.role !== "parent") {
        throw new HatchError("forbidden_child_write", "Parents only", 403);
      }
      const { id } = req.params as { id: string };
      const body = req.body as {
        paused?: boolean;
        riskTier?: "CONSERVATIVE" | "BALANCED" | "GROWTH";
        readingLevel?: number;
        displayName?: string;
      };
      const existing = await getPrisma().child.findFirst({
        where: { id, parentId: req.user.sub },
      });
      if (!existing) throw new HatchError("not_found", "Child not found", 404);
      const child = await getPrisma().child.update({
        where: { id },
        data: {
          paused: body.paused,
          riskTier: body.riskTier,
          readingLevel: body.readingLevel,
          displayName: body.displayName,
        },
      });
      return { child };
    },
  );
}
