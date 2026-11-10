import { afterEach, describe, expect, test } from "bun:test";

import {
  ConcurrentUpdateError,
  FloorPlanConflictError,
  OfflineError,
  requireOnline,
} from "./requireOnline";

const setOnLine = (value: boolean) => {
  Object.defineProperty(navigator, "onLine", { value, configurable: true });
};

describe("requireOnline", () => {
  afterEach(() => setOnLine(true));

  test("オンラインなら例外を投げない", () => {
    setOnLine(true);
    expect(() => requireOnline()).not.toThrow();
  });

  test("オフラインなら OfflineError を投げる", () => {
    setOnLine(false);
    expect(() => requireOnline()).toThrow(OfflineError);
  });

  test("各エラーは判別用フラグを持つ", () => {
    expect(new OfflineError().isOffline).toBe(true);
    expect(new ConcurrentUpdateError().isConcurrentUpdate).toBe(true);
    expect(new FloorPlanConflictError().isFloorPlanConflict).toBe(true);
  });
});
