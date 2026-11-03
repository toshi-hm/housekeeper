import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { safeGetItem, safeSetItem } from "@/lib/safeStorage";

describe("safeStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    // spyOn は各テストで restore する
  });

  test("保存した値を読み出せる", () => {
    safeSetItem("k", "v");
    expect(safeGetItem("k")).toBe("v");
  });

  test("未保存のキーは null", () => {
    expect(safeGetItem("missing")).toBeNull();
  });

  test("getItem が例外を投げても null を返す", () => {
    const spy = spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    try {
      expect(safeGetItem("k")).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  test("setItem が例外を投げても握りつぶす", () => {
    const spy = spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    try {
      expect(() => safeSetItem("k", "v")).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});
