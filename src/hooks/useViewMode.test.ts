import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "bun:test";

import { useViewMode } from "@/hooks/useViewMode";

const STORAGE_KEY = "dashboard.viewMode";

describe("useViewMode", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("localStorageに保存がない場合はgridをデフォルトにする", () => {
    const { result } = renderHook(() => useViewMode());
    expect(result.current.viewMode).toBe("grid");
  });

  test("localStorageに保存済みの値があればそれを初期値として使う", () => {
    window.localStorage.setItem(STORAGE_KEY, "list");
    const { result } = renderHook(() => useViewMode());
    expect(result.current.viewMode).toBe("list");
  });

  test("不正な値がlocalStorageに入っている場合はgridにフォールバックする", () => {
    window.localStorage.setItem(STORAGE_KEY, "invalid");
    const { result } = renderHook(() => useViewMode());
    expect(result.current.viewMode).toBe("grid");
  });

  test("setViewModeでstateとlocalStorageの両方が更新される", () => {
    const { result } = renderHook(() => useViewMode());

    act(() => {
      result.current.setViewMode("list");
    });

    expect(result.current.viewMode).toBe("list");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("list");
  });

  test("再マウント後も選択した表示モードを維持する（ページリロード相当）", () => {
    const { result, unmount } = renderHook(() => useViewMode());

    act(() => {
      result.current.setViewMode("list");
    });
    unmount();

    const { result: result2 } = renderHook(() => useViewMode());
    expect(result2.current.viewMode).toBe("list");
  });
});
