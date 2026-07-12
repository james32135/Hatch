import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HatchError } from "../lib/errors.js";
import { requireParent, assertChildAccess } from "../lib/childAccess.js";
import {
  DOCUMENTED_YIELD_ASSUMPTION_BANDS,
  projectGrowth,
  scenarioPack,
  sensitivityAnalysis,
} from "../services/projectionEngine.js";

const projectSchema = z.object({
  startingUsd: z.number().min(0).optional(),
  allowanceUsd: z.number().min(0),
  cadence: z.enum(["weekly", "monthly"]).default("weekly"),
  years: z.number().int().min(1).max(25).default(10),
  annualYield: z.number().min(0).max(0.25).optional(),
  childId: z.string().optional(),
});

export async function registerProjectionRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get("/api/projections/assumptions", async () => ({
    documentedYieldBands: DOCUMENTED_YIELD_ASSUMPTION_BANDS,
    note: "These are ASSUMPTION bands for parent education — not live APYs.",
  }));

  app.post(
    "/api/projections/run",
    { preHandler: [app.authenticate] },
    async (req) => {
      requireParent(req);
      const parsed = projectSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HatchError("invalid_body", parsed.error.message, 400);
      }
      const startingUsd = parsed.data.startingUsd ?? 0;
      if (parsed.data.childId) {
        await assertChildAccess(req, parsed.data.childId);
      }
      const annualYield =
        parsed.data.annualYield ?? DOCUMENTED_YIELD_ASSUMPTION_BANDS.base;
      const result = projectGrowth({
        startingUsd,
        allowanceUsd: parsed.data.allowanceUsd,
        cadence: parsed.data.cadence,
        years: parsed.data.years,
        annualYield,
      });
      return {
        result,
        ownership: "educational_projection",
        note: "Projection uses caller-provided starting value only. Family SoDEX balances are never treated as child principal.",
      };
    },
  );

  app.post(
    "/api/projections/scenarios",
    { preHandler: [app.authenticate] },
    async (req) => {
      requireParent(req);
      const body = z
        .object({
          startingUsd: z.number().min(0).default(0),
          weeklyAllowanceUsd: z.number().min(0),
          monthlyAllowanceUsd: z.number().min(0).optional(),
          years: z.number().int().min(1).max(25).default(10),
          childId: z.string().optional(),
        })
        .safeParse(req.body);
      if (!body.success) {
        throw new HatchError("invalid_body", body.error.message, 400);
      }
      const startingUsd = body.data.startingUsd;
      if (body.data.childId) {
        await assertChildAccess(req, body.data.childId);
      }
      const monthly =
        body.data.monthlyAllowanceUsd ?? body.data.weeklyAllowanceUsd * 4;
      return {
        ...scenarioPack({
        startingUsd,
        weeklyAllowanceUsd: body.data.weeklyAllowanceUsd,
        monthlyAllowanceUsd: monthly,
        years: body.data.years,
        }),
        ownership: "educational_projection",
        startingValueSource: "request",
      };
    },
  );

  app.post(
    "/api/projections/sensitivity",
    { preHandler: [app.authenticate] },
    async (req) => {
      requireParent(req);
      const body = z
        .object({
          startingUsd: z.number().min(0).default(0),
          allowanceUsd: z.number().min(0),
          cadence: z.enum(["weekly", "monthly"]).default("weekly"),
          years: z.number().int().min(1).max(25).default(10),
          yields: z.array(z.number().min(0).max(0.25)).optional(),
        })
        .safeParse(req.body);
      if (!body.success) {
        throw new HatchError("invalid_body", body.error.message, 400);
      }
      return {
        rows: sensitivityAnalysis(body.data),
        note: "Sensitivity uses caller yields or documented assumption bands",
      };
    },
  );
}
