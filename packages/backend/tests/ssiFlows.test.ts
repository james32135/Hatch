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

  it("Path B blocked — WLP-only per whitepaper", () => {
    const b = planPathBMint();
    expect(b.available).toBe(false);
    expect(b.reason).toMatch(/WLP|blocked|Path A/i);
  });

  it("stake redirects to SSI Earn with official stakeFactory", () => {
    const s = planStake();
    expect(s.path).toBe("SSI_EARN_REDIRECT");
    expect(s.earnUrl).toMatch(/ssi\.sosovalue/);
    expect(ssiCapabilityMatrix().pathB_baseMint.available).toBe(false);
    expect(ssiCapabilityMatrix().protocol.swap).toMatch(/^0x/i);
  });

  it("capability matrix custody false", () => {
    expect(ssiCapabilityMatrix().custody).toBe(false);
  });
});
