import { describe, expect, it } from "vitest";
import {
  directionFromDelta,
  lessonCacheKey,
} from "../src/agents/education.js";

describe("lesson engine helpers", () => {
  it("maps delta to direction", () => {
    expect(directionFromDelta(1.2)).toBe("up");
    expect(directionFromDelta(-0.5)).toBe("down");
    expect(directionFromDelta(0)).toBe("flat");
    expect(directionFromDelta(null)).toBe("flat");
  });

  it("builds stable cache keys", () => {
    expect(
      lessonCacheKey({
        asset: "MAG7",
        direction: "up",
        ageBand: "9-12",
        kind: "portfolio_delta",
      }),
    ).toBe("hatch:lesson:tpl:portfolio_delta:MAG7:up:9-12");
  });
});
