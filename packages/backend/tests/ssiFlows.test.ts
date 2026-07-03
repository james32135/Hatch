import { describe, expect, it } from "vitest";
import {
  planMint,
  planPathBMint,
  planStake,
  ssiCapabilityMatrix,
} from "../src/services/ssiFlows.js";

describe("SSI flows (architecture-locked)", () => {
  it("Path A mint available without router", () => {
    const plan = planMint({ index: "MAG7", amountUsd: 10 });
    expect(plan.available).toBe(true);
    expect(plan.path).toBe("A_SODEX_VAULT");
  });

  it("Path B blocked without router", () => {
    const b = planPathBMint();
    expect(b.available).toBe(false);
    expect(b.reason).toMatch(/SSI_ROUTER_ADDRESS|blocked/i);
  });

  it("stake redirects to SSI Earn when staking addr blank", () => {
    const s = planStake();
    expect(s.path).toBe("SSI_EARN_REDIRECT");
    expect(s.earnUrl).toMatch(/ssi\.sosovalue/);
  });

  it("capability matrix custody false", () => {
    expect(ssiCapabilityMatrix().custody).toBe(false);
  });
});
