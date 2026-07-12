import { describe, expect, it } from "vitest";
import { parseNotionalUsd } from "../src/services/investmentAgent.js";

describe("investment agent helpers", () => {
  it("parses dollar amounts from user text", () => {
    expect(parseNotionalUsd("Where should I invest $20")).toBe(20);
    expect(parseNotionalUsd("invest 15.50 dollars")).toBe(15.5);
    expect(parseNotionalUsd("no amount here")).toBeNull();
  });
});
