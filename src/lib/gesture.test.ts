import { describe, expect, it } from "bun:test";

import {
  clampSwipe,
  dampenPull,
  detectAxis,
  isPullReady,
  PULL_MAX,
  PULL_THRESHOLD,
  resolveSwipe,
  SWIPE_MAX,
  SWIPE_THRESHOLD,
} from "./gesture";

describe("dampenPull", () => {
  it("returns 0 for upward or zero movement and invalid numbers", () => {
    expect(dampenPull(-30)).toBe(0);
    expect(dampenPull(0)).toBe(0);
    expect(dampenPull(Number.NaN)).toBe(0);
  });

  it("applies resistance and caps at PULL_MAX", () => {
    expect(dampenPull(100)).toBe(50);
    expect(dampenPull(10_000)).toBe(PULL_MAX);
  });
});

describe("isPullReady", () => {
  it("is true only at or beyond the threshold", () => {
    expect(isPullReady(PULL_THRESHOLD - 1)).toBe(false);
    expect(isPullReady(PULL_THRESHOLD)).toBe(true);
  });
});

describe("detectAxis", () => {
  it("is undefined while the movement is within tap slop", () => {
    expect(detectAxis(3, -4)).toBeUndefined();
  });

  it("picks the dominant axis", () => {
    expect(detectAxis(30, 5)).toBe("x");
    expect(detectAxis(-30, 5)).toBe("x");
    expect(detectAxis(5, 30)).toBe("y");
  });
});

describe("clampSwipe", () => {
  it("only moves in directions that have an action", () => {
    expect(clampSwipe(50, { left: true, right: false })).toBe(0);
    expect(clampSwipe(-50, { left: false, right: true })).toBe(0);
    expect(clampSwipe(50, { left: false, right: true })).toBe(50);
    expect(clampSwipe(-50, { left: true, right: false })).toBe(-50);
  });

  it("caps the offset at SWIPE_MAX", () => {
    expect(clampSwipe(999, { left: true, right: true })).toBe(SWIPE_MAX);
    expect(clampSwipe(-999, { left: true, right: true })).toBe(-SWIPE_MAX);
  });
});

describe("resolveSwipe", () => {
  it("resolves left/right only past the threshold", () => {
    expect(resolveSwipe(-SWIPE_THRESHOLD)).toBe("left");
    expect(resolveSwipe(SWIPE_THRESHOLD)).toBe("right");
    expect(resolveSwipe(SWIPE_THRESHOLD - 1)).toBeNull();
    expect(resolveSwipe(-(SWIPE_THRESHOLD - 1))).toBeNull();
    expect(resolveSwipe(0)).toBeNull();
  });
});
