import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPrisma } from "../lib/prisma.js";
import { HatchError } from "../lib/errors.js";
import { getEnv } from "../config/env.js";
import { resolveProfile } from "../config/environment.js";
import {
  buildAllowanceSignHandoff,
  computePolicyHash,
  createHandoffForPolicy,
  auditPolicyChange,
  type AllowanceSignHandoff,
} from "../services/allowanceHandoff.js";
import { draftAllowanceParentSign } from "../services/parentSignDraft.js";
import { resolveParentSodexAccountId } from "../services/parentAccountId.js";

const policySchema = z.object({
  childId: z.string().min(1),
  amountUsd: z.number().positive().max(10_000),
  cadenceDays: z.number().int().min(1).max(30).default(7),
  riskTier: z.enum(["CONSERVATIVE", "BALANCED", "GROWTH"]).default("BALANCED"),
  maxSlippageBps: z.number().int().min(1).max(100).default(50),
  paused: z.boolean().optional(),
});

const signDraftSchema = z.object({
  policyId: z.string().min(1).optional(),
  handoff: z.record(z.string(), z.unknown()).optional(),
  /** Optional — defaults to cached sodexAccountId* on User */
  accountID: z.number().int().positive().optional(),
  network: z.enum(["mainnet", "testnet"]).optional(),
  nonce: z.union([z.string(), z.number()]).optional(),
  refreshAccountId: z.boolean().optional(),
  mids: z
    .object({
      mag7: z.string().optional(),
      ussi: z.string().optional(),
    })
    .optional(),
});

export async function registerAllowanceRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/allowances",
    { preHandler: [app.authenticate] },
    async (req) => {
      if (req.user.role !== "parent") {
        throw new HatchError("forbidden", "Parents only", 403);
      }
      const policies = await getPrisma().allowancePolicy.findMany({
        where: { parentId: req.user.sub },
        orderBy: { createdAt: "desc" },
      });
      return { policies };
    },
  );

  /** Pending allowance → parent-sign handoffs (non-custodial; no auto-trade). */
  app.get(
    "/api/allowances/handoffs",
    { preHandler: [app.authenticate] },
    async (req) => {
      if (req.user.role !== "parent") {
        throw new HatchError("forbidden", "Parents only", 403);
      }
      const parentId = req.user.sub;
      const events = await getPrisma().systemEvent.findMany({
        where: { kind: "allowance_sign_handoff" },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      const handoffs = events
        .map((e) => e.payload as { parentId?: string })
        .filter((p) => p.parentId === parentId);
      return {
        handoffs,
        note: "Parent must EIP-712 sign and POST /api/sodex/relay",
      };
    },
  );

  /**
   * Build UNSIGNED EIP-712 typed data for a due allowance handoff.
   * Backend never signs — parent wallet signs, then relays.
   */
  app.post(
    "/api/allowances/sign-draft",
    { preHandler: [app.authenticate] },
    async (req) => {
      if (req.user.role !== "parent") {
        throw new HatchError("forbidden_child_write", "Parents only", 403);
      }
      const parsed = signDraftSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HatchError("invalid_body", parsed.error.message, 400);
      }

      let handoff: AllowanceSignHandoff | null = null;
      if (parsed.data.handoff) {
        const h = parsed.data.handoff as unknown as AllowanceSignHandoff;
        if (h.parentId !== req.user.sub) {
          throw new HatchError("forbidden", "Not your handoff", 403);
        }
        handoff = h;
      } else if (parsed.data.policyId) {
        const policy = await getPrisma().allowancePolicy.findFirst({
          where: { id: parsed.data.policyId, parentId: req.user.sub },
        });
        if (!policy) throw new HatchError("not_found", "Policy not found", 404);
        handoff = buildAllowanceSignHandoff({
          policyId: policy.id,
          childId: policy.childId,
          parentId: policy.parentId,
          amountUsd: policy.amountUsd.toString(),
          riskTier: policy.riskTier,
        });
      } else {
        throw new HatchError(
          "invalid_body",
          "policyId or handoff required",
          400,
        );
      }

      const profile = resolveProfile(
        (req.headers["x-hatch-profile"] as string | undefined) ??
          getEnv().HATCH_DEFAULT_PROFILE,
      );
      const network =
        parsed.data.network ??
        (profile.id === "mainnet" ? "mainnet" : "testnet");

      const resolved = await resolveParentSodexAccountId({
        parentId: req.user.sub,
        wallet: req.user.wallet,
        network,
        override: parsed.data.accountID,
        refreshIfMissing: parsed.data.refreshAccountId ?? true,
      });

      const draft = draftAllowanceParentSign({
        handoff,
        accountID: resolved.accountID,
        network,
        nonce: parsed.data.nonce,
        mids: parsed.data.mids,
      });

      return {
        draft,
        accountID: resolved.accountID,
        accountIdSource: resolved.source,
        note: "UNSIGNED. Sign typedData in parent wallet, set apiSign on draft.relayRequest, then POST /api/sodex/relay.",
      };
    },
  );

  app.post(
    "/api/allowances",
    { preHandler: [app.authenticate] },
    async (req) => {
      if (req.user.role !== "parent") {
        throw new HatchError("forbidden_child_write", "Parents only", 403);
      }
      const parsed = policySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new HatchError("invalid_body", parsed.error.message, 400);
      }
      const child = await getPrisma().child.findFirst({
        where: { id: parsed.data.childId, parentId: req.user.sub },
      });
      if (!child) throw new HatchError("not_found", "Child not found", 404);

      const nextDueAt = new Date(
        Date.now() + parsed.data.cadenceDays * 24 * 60 * 60 * 1000,
      );
      const policyHash = computePolicyHash({
        childId: parsed.data.childId,
        amountUsd: parsed.data.amountUsd,
        cadenceDays: parsed.data.cadenceDays,
        riskTier: parsed.data.riskTier,
        maxSlippageBps: parsed.data.maxSlippageBps,
      });
      const policy = await getPrisma().allowancePolicy.create({
        data: {
          childId: parsed.data.childId,
          parentId: req.user.sub,
          amountUsd: parsed.data.amountUsd,
          cadenceDays: parsed.data.cadenceDays,
          riskTier: parsed.data.riskTier,
          maxSlippageBps: parsed.data.maxSlippageBps,
          paused: parsed.data.paused ?? false,
          nextDueAt,
          policyHash,
        },
      });
      await auditPolicyChange({
        policyId: policy.id,
        parentId: req.user.sub,
        action: "create",
        detail: { amountUsd: parsed.data.amountUsd, policyHash },
      });
      return { policy };
    },
  );

  /** Manual allowance trigger — creates handoff now (idempotent per day). */
  app.post(
    "/api/allowances/:id/trigger",
    { preHandler: [app.authenticate] },
    async (req) => {
      if (req.user.role !== "parent") {
        throw new HatchError("forbidden_child_write", "Parents only", 403);
      }
      const { id } = req.params as { id: string };
      const policy = await getPrisma().allowancePolicy.findFirst({
        where: { id, parentId: req.user.sub },
      });
      if (!policy) throw new HatchError("not_found", "Policy not found", 404);
      const result = await createHandoffForPolicy(policy, {
        trigger: "manual",
        advanceNextDue: false,
      });
      await auditPolicyChange({
        policyId: policy.id,
        parentId: req.user.sub,
        action: "manual_trigger",
        detail: { created: result.created, reason: result.reason },
      });
      return result;
    },
  );

  app.patch(
    "/api/allowances/:id",
    { preHandler: [app.authenticate] },
    async (req) => {
      if (req.user.role !== "parent") {
        throw new HatchError("forbidden_child_write", "Parents only", 403);
      }
      const { id } = req.params as { id: string };
      const body = req.body as {
        paused?: boolean;
        amountUsd?: number;
        riskTier?: "CONSERVATIVE" | "BALANCED" | "GROWTH";
        maxSlippageBps?: number;
      };
      const existing = await getPrisma().allowancePolicy.findFirst({
        where: { id, parentId: req.user.sub },
      });
      if (!existing) throw new HatchError("not_found", "Policy not found", 404);

      const amountUsd = body.amountUsd ?? Number(existing.amountUsd);
      const riskTier = body.riskTier ?? existing.riskTier;
      const maxSlippageBps = body.maxSlippageBps ?? existing.maxSlippageBps;
      const policyHash = computePolicyHash({
        childId: existing.childId,
        amountUsd,
        cadenceDays: existing.cadenceDays,
        riskTier,
        maxSlippageBps,
      });

      const policy = await getPrisma().allowancePolicy.update({
        where: { id },
        data: {
          paused: body.paused,
          amountUsd: body.amountUsd,
          riskTier: body.riskTier,
          maxSlippageBps: body.maxSlippageBps,
          policyHash,
        },
      });

      if (body.paused === true) {
        await auditPolicyChange({
          policyId: id,
          parentId: req.user.sub,
          action: "pause",
        });
      } else if (body.paused === false) {
        await auditPolicyChange({
          policyId: id,
          parentId: req.user.sub,
          action: "resume",
        });
      } else {
        await auditPolicyChange({
          policyId: id,
          parentId: req.user.sub,
          action: "update",
          detail: body as Record<string, unknown>,
        });
      }
      return { policy };
    },
  );
}
