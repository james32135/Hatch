import { describe, expect, it } from "vitest";
import {
  buildAllowanceSignHandoff,
  RISK_ALLOCATION,
} from "../src/services/allowanceHandoff.js";

describe("allowance sign handoff", () => {
  it("builds BALANCED allocation without signing", () => {
    const h = buildAllowanceSignHandoff({
      policyId: "pol_1",
      childId: "child_1",
      parentId: "parent_1",
      amountUsd: 10,
      riskTier: "BALANCED",
    });
    expect(h.status).toBe("AWAITING_PARENT_SIGNATURE");
    expect(h.kind).toBe("allowance_sign_handoff");
    expect(h.allocation).toEqual(RISK_ALLOCATION.BALANCED);
    expect(h.suggestedNotional.mag7Usd).toBe(5);
    expect(h.suggestedNotional.ussiUsd).toBe(5);
    expect(h.note).toMatch(/does not custody/i);
  });

  it("GROWTH favors MAG7", () => {
    const h = buildAllowanceSignHandoff({
      policyId: "pol_2",
      childId: "c",
      parentId: "p",
      amountUsd: "100",
      riskTier: "GROWTH",
    });
    expect(h.suggestedNotional.mag7Usd).toBe(80);
    expect(h.suggestedNotional.ussiUsd).toBe(20);
  });

  it("includes idempotencyKey", () => {
    const h = buildAllowanceSignHandoff({
      policyId: "pol_1",
      childId: "child_1",
      parentId: "parent_1",
      amountUsd: 10,
      riskTier: "BALANCED",
      at: new Date("2026-07-11T12:00:00Z"),
    });
    expect(h.idempotencyKey).toHaveLength(32);
    expect(h.trigger).toBe("scheduled");
  });
});
