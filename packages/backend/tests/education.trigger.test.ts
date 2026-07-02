/**
 * Education trigger on priced portfolio delta + AgentLog row.
 */
import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getEnv, resetEnvCache } from "../src/config/env.js";
import { getPrisma } from "../src/lib/prisma.js";
import { snapshotMateriallyChanged } from "../src/services/snapshotPricing.js";
import { generateLessonForChild } from "../src/agents/education.js";

function loadRootEnv(): void {
  for (const p of [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
  ]) {
    if (existsSync(p)) loadDotenv({ path: p, override: false });
  }
  if (!process.env.SOSO_API_KEY && process.env.SoSoValue_API_key) {
    process.env.SOSO_API_KEY = process.env.SoSoValue_API_key;
  }
}

describe("education trigger on priced delta", () => {
  let childId = "";
  let parentId = "";

  beforeAll(async () => {
    loadRootEnv();
    resetEnvCache();
    getEnv();
    const prisma = getPrisma();
    const parent = await prisma.user.create({
      data: {
        walletAddress: `0xedu${Date.now().toString(16).padStart(36, "0")}`.slice(
          0,
          42,
        ),
      },
    });
    parentId = parent.id;
    const child = await prisma.child.create({
      data: {
        parentId: parent.id,
        displayName: "EduDeltaKid",
        ageYears: 10,
        readingLevel: 2,
      },
    });
    childId = child.id;
  });

  afterAll(async () => {
    const prisma = getPrisma();
    if (childId) {
      await prisma.agentLog.deleteMany({ where: { childId } });
      await prisma.lesson.deleteMany({ where: { childId } });
      await prisma.portfolioSnapshot.deleteMany({ where: { childId } });
      await prisma.child.deleteMany({ where: { id: childId } });
    }
    if (parentId) {
      await prisma.user.deleteMany({ where: { id: parentId } });
    }
  });

  it("detects material USD move that should fire education", () => {
    expect(
      snapshotMateriallyChanged(
        { totalUsd: 100, rawBalancesJson: { vUSDC: 100 } },
        { totalUsd: 105, rawBalancesJson: { vUSDC: 105 } },
      ),
    ).toBe(true);
    expect(
      snapshotMateriallyChanged(
        { totalUsd: 100, rawBalancesJson: { vUSDC: 100 } },
        { totalUsd: 100.001, rawBalancesJson: { vUSDC: 100.001 } },
      ),
    ).toBe(false);
  });

  it("generateLessonForChild writes Lesson + AgentLog", async () => {
    const result = await generateLessonForChild({
      childId,
      triggerDelta: 5,
    });
    expect(result.id).toBeTruthy();
    expect(["READY", "FAILED"]).toContain(result.status);

    const prisma = getPrisma();
    const lesson = await prisma.lesson.findUnique({ where: { id: result.id } });
    expect(lesson).toBeTruthy();
    expect(lesson?.childId).toBe(childId);

    const log = await prisma.agentLog.findFirst({
      where: { childId, agent: "education" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).toBeTruthy();
    expect(log?.ok).toBe(result.status === "READY");
  }, 90_000);
});
