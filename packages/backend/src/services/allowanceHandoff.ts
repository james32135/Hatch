/**
 * Allowance due → parent-sign handoff (NON-CUSTODIAL).
 * Backend never signs or places trades; it only prepares a sign request for the parent.
 * Idempotency: one handoff per policy per due-period bucket.
 */
import { createHash } from "node:crypto";
import { getPrisma } from "../lib/prisma.js";
import { logger } from "../lib/logger.js";
import { SODEX_SYMBOLS } from "../config/addresses.js";

export const RISK_ALLOCATION = {
  CONSERVATIVE: { ussiPct: 80, mag7Pct: 20 },
  BALANCED: { ussiPct: 50, mag7Pct: 50 },
  GROWTH: { ussiPct: 20, mag7Pct: 80 },
} as const;

export interface AllowanceSignHandoff {
  kind: "allowance_sign_handoff";
  policyId: string;
  childId: string;
  parentId: string;
  amountUsd: string;
  riskTier: keyof typeof RISK_ALLOCATION;
  allocation: { ussiPct: number; mag7Pct: number };
  symbols: {
    vMAG7ssi_vUSDC: { id: number; name: string };
    vUSSI_vUSDC: { id: number; name: string };
  };
  suggestedNotional: { mag7Usd: number; ussiUsd: number };
  status: "AWAITING_PARENT_SIGNATURE";
  idempotencyKey: string;
  trigger: "scheduled" | "manual";
  note: string;
  createdAt: string;
}

export function computePolicyHash(input: {
  childId: string;
  amountUsd: string | number;
  cadenceDays: number;
  riskTier: string;
  maxSlippageBps: number;
}): string {
  const raw = JSON.stringify({
    childId: input.childId,
    amountUsd: String(input.amountUsd),
    cadenceDays: input.cadenceDays,
    riskTier: input.riskTier,
    maxSlippageBps: input.maxSlippageBps,
  });
  return createHash("sha256").update(raw).digest("hex");
}

/** Bucket due period so retries don't duplicate handoffs */
export function duePeriodKey(policyId: string, at = new Date()): string {
  const day = at.toISOString().slice(0, 10);
  return createHash("sha256")
    .update(`${policyId}:${day}`)
    .digest("hex")
    .slice(0, 32);
}

export function buildAllowanceSignHandoff(input: {
  policyId: string;
  childId: string;
  parentId: string;
  amountUsd: number | string;
  riskTier: keyof typeof RISK_ALLOCATION;
  trigger?: "scheduled" | "manual";
  at?: Date;
}): AllowanceSignHandoff {
  const amount =
    typeof input.amountUsd === "string"
      ? Number(input.amountUsd)
      : input.amountUsd;
  const allocation = RISK_ALLOCATION[input.riskTier];
  const idempotencyKey = duePeriodKey(input.policyId, input.at ?? new Date());
  return {
    kind: "allowance_sign_handoff",
    policyId: input.policyId,
    childId: input.childId,
    parentId: input.parentId,
    amountUsd: String(amount),
    riskTier: input.riskTier,
    allocation,
    symbols: {
      vMAG7ssi_vUSDC: {
        id: SODEX_SYMBOLS.vMAG7ssi_vUSDC.id,
        name: SODEX_SYMBOLS.vMAG7ssi_vUSDC.name,
      },
      vUSSI_vUSDC: {
        id: SODEX_SYMBOLS.vUSSI_vUSDC.id,
        name: SODEX_SYMBOLS.vUSSI_vUSDC.name,
      },
    },
    suggestedNotional: {
      mag7Usd: (amount * allocation.mag7Pct) / 100,
      ussiUsd: (amount * allocation.ussiPct) / 100,
    },
    status: "AWAITING_PARENT_SIGNATURE",
    idempotencyKey,
    trigger: input.trigger ?? "scheduled",
    note: "Parent must EIP-712 sign and POST /api/sodex/relay. Backend does not custody keys or auto-trade.",
    createdAt: new Date().toISOString(),
  };
}

async function handoffExists(idempotencyKey: string): Promise<boolean> {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const events = await getPrisma().systemEvent.findMany({
    where: { kind: "allowance_sign_handoff", createdAt: { gte: since } },
    take: 200,
    orderBy: { createdAt: "desc" },
  });
  return events.some((e) => {
    const p = e.payload as { idempotencyKey?: string };
    return p.idempotencyKey === idempotencyKey;
  });
}

export async function createHandoffForPolicy(
  policy: {
    id: string;
    childId: string;
    parentId: string;
    amountUsd: { toString(): string } | number | string;
    riskTier: keyof typeof RISK_ALLOCATION;
    cadenceDays: number;
    paused: boolean;
  },
  opts: { trigger: "scheduled" | "manual"; advanceNextDue: boolean },
): Promise<{ created: boolean; handoff?: AllowanceSignHandoff; reason?: string }> {
  if (policy.paused) {
    return { created: false, reason: "paused" };
  }
  const handoff = buildAllowanceSignHandoff({
    policyId: policy.id,
    childId: policy.childId,
    parentId: policy.parentId,
    amountUsd: policy.amountUsd.toString(),
    riskTier: policy.riskTier,
    trigger: opts.trigger,
  });
  if (await handoffExists(handoff.idempotencyKey)) {
    return { created: false, reason: "duplicate_idempotency", handoff };
  }

  const prisma = getPrisma();
  await prisma.systemEvent.create({
    data: { kind: "allowance_sign_handoff", payload: handoff as object },
  });
  // Notification hook (parent UI / future push)
  await prisma.systemEvent.create({
    data: {
      kind: "allowance_notify_parent",
      payload: {
        parentId: policy.parentId,
        childId: policy.childId,
        policyId: policy.id,
        idempotencyKey: handoff.idempotencyKey,
        channel: "system_event",
        message: "Allowance due — sign SoDEX orders to invest",
        at: new Date().toISOString(),
      },
    },
  });

  if (opts.advanceNextDue) {
    await prisma.allowancePolicy.update({
      where: { id: policy.id },
      data: {
        nextDueAt: new Date(
          Date.now() + policy.cadenceDays * 24 * 60 * 60 * 1000,
        ),
      },
    });
  }

  return { created: true, handoff };
}

export async function runAllowanceDueHandoffs(): Promise<number> {
  const prisma = getPrisma();
  const due = await prisma.allowancePolicy.findMany({
    where: {
      paused: false,
      nextDueAt: { lte: new Date() },
    },
    take: 100,
  });
  if (!due.length) return 0;

  let created = 0;
  for (const policy of due) {
    const result = await createHandoffForPolicy(policy, {
      trigger: "scheduled",
      advanceNextDue: true,
    });
    if (result.created) created += 1;
    else if (result.reason === "duplicate_idempotency") {
      // Still advance to avoid stuck due loop
      await prisma.allowancePolicy.update({
        where: { id: policy.id },
        data: {
          nextDueAt: new Date(
            Date.now() + policy.cadenceDays * 24 * 60 * 60 * 1000,
          ),
        },
      });
    }
  }

  logger.info(
    { count: created },
    "allowance sign handoffs created (await parent signature)",
  );
  return created;
}

export async function auditPolicyChange(input: {
  policyId: string;
  parentId: string;
  action: "pause" | "resume" | "update" | "create" | "manual_trigger";
  detail?: Record<string, unknown>;
}): Promise<void> {
  await getPrisma().systemEvent.create({
    data: {
      kind: "allowance_policy_audit",
      payload: JSON.parse(
        JSON.stringify({
          policyId: input.policyId,
          parentId: input.parentId,
          action: input.action,
          detail: input.detail ?? null,
          timestamp: new Date().toISOString(),
        }),
      ) as object,
    },
  });
}
