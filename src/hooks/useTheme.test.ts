import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, spyOn, test } from "bun:test";

import { useTheme } from "@/hooks/useTheme";

describe("useTheme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  test("保存がなければ system", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("system");
  });

  test("不正な保存値は system にフォールバックする", () => {
    window.localStorage.setItem("theme", "bogus");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("system");
  });

  test("setTheme で保存され dark クラスが付く", () => {
    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark"));
    expect(window.localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  test("localStorage が例外を投げてもクラッシュしない", () => {
    const g = spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const s = spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    try {
      const { result } = renderHook(() => useTheme());
      expect(result.current.theme).toBe("system");
      act(() => result.current.setTheme("dark"));
      expect(result.current.theme).toBe("dark");
    } finally {
      g.mockRestore();
      s.mockRestore();
    }
  });
});
