import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, test } from "bun:test";

import { useTheme } from "@/hooks/useTheme";

describe("useTheme", () => {
  afterEach(() => {
    localStorage.removeItem("theme");
    document.documentElement.classList.remove("dark");
  });

  test("初期値は localStorage がなければ system", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("system");
  });

  test("setTheme で保存され dark クラスが切り替わる", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setTheme("dark");
    });

    expect(result.current.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      result.current.setTheme("light");
    });

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  test("localStorage の値を初期値として読む", () => {
    localStorage.setItem("theme", "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("dark");
  });
});
