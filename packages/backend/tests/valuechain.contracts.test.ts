import { describe, expect, it } from "vitest";
import { verifyHatchContracts } from "../src/services/valuechainContracts.js";
import { HATCH_CONTRACTS } from "../src/config/addresses.js";

describe("ValueChain HATCH contracts (mainnet live)", () => {
  it("verifies deployed HATCHLog + HATCHSchedule", async () => {
    expect(HATCH_CONTRACTS.mainnet.log).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(HATCH_CONTRACTS.mainnet.schedule).toMatch(/^0x[a-fA-F0-9]{40}$/);
    const report = await verifyHatchContracts("mainnet");
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.hatchLog.bytecode).toBe(true);
    expect(report.hatchLog.upgradeable).toBe(false);
    expect(report.hatchLog.custody).toBe(false);
    expect(report.hatchLog.deployer.toLowerCase()).toBe(
      "0xBDfCeE82Bd42FEfA58ee850B3709636a8B6b0034".toLowerCase(),
    );
    expect(report.hatchSchedule?.bytecode).toBe(true);
  }, 30_000);
});

describe("ValueChain HATCH contracts (testnet live)", () => {
  it("verifies testnet HATCHLog + HATCHSchedule", async () => {
    expect(HATCH_CONTRACTS.testnet.log).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(HATCH_CONTRACTS.testnet.schedule).toMatch(/^0x[a-fA-F0-9]{40}$/);
    const report = await verifyHatchContracts("testnet");
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.hatchLog.bytecode).toBe(true);
    expect(report.hatchLog.deployer.toLowerCase()).toBe(
      "0xBDfCeE82Bd42FEfA58ee850B3709636a8B6b0034".toLowerCase(),
    );
    expect(report.hatchSchedule?.bytecode).toBe(true);
  }, 30_000);
});
