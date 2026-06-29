/**
 * One-shot: create due allowance → runAllowanceDueHandoffs → print result.
 * Non-custodial: creates SystemEvent only; never signs.
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(root, ".env") });

const { getPrisma } = await import("../src/lib/prisma.js");
const { runAllowanceDueHandoffs } = await import(
  "../src/services/allowanceHandoff.js"
);

const prisma = getPrisma();
let parent = await prisma.user.findFirst();
if (!parent) {
  parent = await prisma.user.create({
    data: {
      walletAddress: `0xhandoff${Date.now().toString(16).padStart(32, "0")}`.slice(
        0,
        42,
      ),
    },
  });
}

let child = await prisma.child.findFirst({ where: { parentId: parent.id } });
if (!child) {
  child = await prisma.child.create({
    data: {
      parentId: parent.id,
      displayName: "Handoff Test",
      ageYears: 10,
    },
  });
}

const policy = await prisma.allowancePolicy.create({
  data: {
    childId: child.id,
    parentId: parent.id,
    amountUsd: 7,
    cadenceDays: 7,
    riskTier: "BALANCED",
    maxSlippageBps: 50,
    paused: false,
    nextDueAt: new Date(Date.now() - 60_000),
  },
});

const n = await runAllowanceDueHandoffs();
const evt = await prisma.systemEvent.findFirst({
  where: { kind: "allowance_sign_handoff" },
  orderBy: { createdAt: "desc" },
});
const updated = await prisma.allowancePolicy.findUnique({
  where: { id: policy.id },
});
const payload = evt?.payload ?? {};

console.log(
  JSON.stringify(
    {
      ok: true,
      handoffsCreated: n,
      policyId: policy.id,
      nextDueAdvanced: !!(updated?.nextDueAt && updated.nextDueAt > new Date()),
      eventKind: evt?.kind,
      payloadStatus: payload.status,
      suggestedNotional: payload.suggestedNotional,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
process.exit(0);
