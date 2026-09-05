import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "bun:test";

import { useCartCheckOff } from "@/hooks/useCartCheckOff";

const STORAGE_KEY = "shopping.cartCheckedIds";

describe("useCartCheckOff", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("localStorageに保存がない場合はcheckedIdsが空になる", () => {
    const { result } = renderHook(() => useCartCheckOff());
    expect(result.current.checkedIds.size).toBe(0);
  });

  test("localStorageに保存済みのIDがあればcheckedIdsに含める", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ s1: true, s2: true }));
    const { result } = renderHook(() => useCartCheckOff());
    expect(result.current.checkedIds.has("s1")).toBe(true);
    expect(result.current.checkedIds.has("s2")).toBe(true);
  });

  test("不正な値がlocalStorageに入っている場合は空にフォールバックする", () => {
    window.localStorage.setItem(STORAGE_KEY, "not json");
    const { result } = renderHook(() => useCartCheckOff());
    expect(result.current.checkedIds.size).toBe(0);
  });

  test("配列が保存されている場合も空にフォールバックする", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(["s1"]));
    const { result } = renderHook(() => useCartCheckOff());
    expect(result.current.checkedIds.size).toBe(0);
  });

  test("toggleでチェックが付き、localStorageにも保存される", () => {
    const { result } = renderHook(() => useCartCheckOff());

    act(() => {
      result.current.toggle("s1");
    });

    expect(result.current.checkedIds.has("s1")).toBe(true);
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored).toEqual({ s1: true });
  });

  test("チェック済みのIDを再度toggleするとチェックが外れる", () => {
    const { result } = renderHook(() => useCartCheckOff());

    act(() => {
      result.current.toggle("s1");
    });
    act(() => {
      result.current.toggle("s1");
    });

    expect(result.current.checkedIds.has("s1")).toBe(false);
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}");
    expect(stored).toEqual({});
  });

  test("clearで指定したIDのみチェック状態が消える", () => {
    const { result } = renderHook(() => useCartCheckOff());

    act(() => {
      result.current.toggle("s1");
    });
    act(() => {
      result.current.toggle("s2");
    });
    act(() => {
      result.current.clear("s1");
    });

    expect(result.current.checkedIds.has("s1")).toBe(false);
    expect(result.current.checkedIds.has("s2")).toBe(true);
  });

  test("チェックされていないIDをclearしても何も変化しない", () => {
    const { result } = renderHook(() => useCartCheckOff());

    act(() => {
      result.current.clear("nope");
    });

    expect(result.current.checkedIds.size).toBe(0);
  });

  test("再マウント後もチェック状態を維持する（セッションを跨いでも残る、#983）", () => {
    const { result, unmount } = renderHook(() => useCartCheckOff());

    act(() => {
      result.current.toggle("s1");
    });
    unmount();

    const { result: result2 } = renderHook(() => useCartCheckOff());
    expect(result2.current.checkedIds.has("s1")).toBe(true);
  });
});
