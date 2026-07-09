import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

import i18n from "@/lib/i18n";
import { createSupabaseMock, setNavigatorOnline } from "@/test/supabaseMock";
import { createHookWrapper } from "@/test/testUtils";
import type { UserSettings } from "@/types/item";

const sb = createSupabaseMock();
mock.module("@/lib/supabase", () => ({ supabase: sb.supabase }));

const { useUpdateUserSettings, useUserSettings } = await import("@/hooks/useUserSettings");

const makeSettings = (overrides: Partial<UserSettings> = {}): UserSettings => ({
  user_id: "user-1",
  language: "ja",
  expiry_warning_days: 3,
  default_unit: "個",
  notify_at: "09:00",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

beforeEach(() => {
  sb.reset();
});

afterEach(() => {
  setNavigatorOnline(true);
});

describe("useUserSettings", () => {
  test("設定を取得し language で i18n を切り替える", async () => {
    const changeLanguageSpy = spyOn(i18n, "changeLanguage").mockResolvedValue(undefined as never);
    sb.enqueue("user_settings", { data: makeSettings({ language: "en" }) });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useUserSettings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.language).toBe("en");
    await waitFor(() => expect(changeLanguageSpy).toHaveBeenCalledWith("en"));

    changeLanguageSpy.mockRestore();
  });

  test("未認証なら null を返す", async () => {
    sb.setUser(null);

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useUserSettings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  test("行が存在しない (PGRST116) なら null を返す", async () => {
    sb.enqueue("user_settings", { data: null, error: { message: "no rows", code: "PGRST116" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useUserSettings(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  test("その他のエラーで isError になる", async () => {
    sb.enqueue("user_settings", { error: { message: "boom", code: "500" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useUserSettings(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdateUserSettings", () => {
  test("更新成功でキャッシュを更新し言語を切り替える", async () => {
    const changeLanguageSpy = spyOn(i18n, "changeLanguage").mockResolvedValue(undefined as never);
    const updated = makeSettings({ language: "en", expiry_warning_days: 7 });
    sb.enqueue("user_settings", { data: updated });

    const { wrapper, queryClient } = createHookWrapper();
    const { result } = renderHook(() => useUpdateUserSettings(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ language: "en", expiry_warning_days: 7 });
    });

    expect(queryClient.getQueryData(["settings"])).toEqual(updated);
    expect(changeLanguageSpy).toHaveBeenCalledWith("en");

    changeLanguageSpy.mockRestore();
  });

  test("未認証ならエラーになる", async () => {
    sb.setUser(null);

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useUpdateUserSettings(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ language: "ja" })).rejects.toThrow(
        "Not authenticated",
      );
    });
  });

  test("upsert エラーは throw する", async () => {
    sb.enqueue("user_settings", { error: { message: "upsert failed" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useUpdateUserSettings(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ language: "ja" })).rejects.toBeDefined();
    });
  });

  test("オフラインなら offline トーストを出す", async () => {
    setNavigatorOnline(false);

    const { wrapper, toastCalls } = createHookWrapper();
    const { result } = renderHook(() => useUpdateUserSettings(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({ language: "ja" })).rejects.toThrow();
    });

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });
});
