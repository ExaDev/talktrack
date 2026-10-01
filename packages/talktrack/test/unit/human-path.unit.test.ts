import { describe, expect, it } from "vitest";
import {
  buildHumanPath,
  easeInOutCubic,
  MAX_PATH_STEPS,
  MIN_PATH_STEPS,
  type Point,
} from "../../src/human-path";

describe("buildHumanPath", () => {
  it("returns exactly the target for a sub-threshold move", () => {
    const from: Point = { x: 100, y: 100 };
    expect(buildHumanPath(from, { x: 101, y: 100 })).toEqual([
      { x: 101, y: 100 },
    ]);
  });

  it("always lands exactly on the target regardless of jitter or overshoot", () => {
    const to: Point = { x: 900, y: 400 };
    const path = buildHumanPath({ x: 50, y: 30 }, to);
    expect(path[path.length - 1]).toEqual(to);
  });

  it("keeps step counts between the floor and the cap", () => {
    const shortPath = buildHumanPath({ x: 0, y: 0 }, { x: 10, y: 0 });
    const longPath = buildHumanPath({ x: 0, y: 0 }, { x: 5000, y: 0 });
    expect(shortPath.length).toBeGreaterThanOrEqual(MIN_PATH_STEPS);
    expect(longPath.length).toBeLessThanOrEqual(MAX_PATH_STEPS);
  });

  it("produces finite coordinates throughout", () => {
    const path = buildHumanPath({ x: 0, y: 0 }, { x: 800, y: 600 });
    for (const point of path) {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    }
  });
});

describe("easeInOutCubic", () => {
  it("fixes both endpoints exactly", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });

  it("passes through the midpoint at half progress", () => {
    const HALF = 0.5;
    // Digits of agreement toBeCloseTo checks: the curve is closed-form at the midpoint, so only floating-point rounding separates the two sides.
    const MIDPOINT_PRECISION_DIGITS = 12;
    expect(easeInOutCubic(HALF)).toBeCloseTo(HALF, MIDPOINT_PRECISION_DIGITS);
  });

  it("never decreases across the unit interval", () => {
    const SAMPLE_COUNT = 100;
    let previous = easeInOutCubic(0);
    for (let i = 1; i <= SAMPLE_COUNT; i++) {
      const current = easeInOutCubic(i / SAMPLE_COUNT);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });
});
