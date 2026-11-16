import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

import { OfflineError } from "@/lib/requireOnline";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

let callLog: Array<{ method: string; args: unknown[] }> = [];
let response: SupabaseResponse = { data: null, error: null };
let user: { id: string } | null = { id: "user-1" };

const makeBuilder = () => {
  const builder: Record<string, unknown> = {};
  const chain =
    (method: string) =>
    (...args: unknown[]) => {
      callLog.push({ method, args });
      return builder;
    };
  Object.assign(builder, {
    select: chain("select"),
    eq: chain("eq"),
    upsert: chain("upsert"),
    single: () => {
      callLog.push({ method: "single", args: [] });
      return Promise.resolve(response);
    },
  });
  return builder;
};

const fromMock = mock(() => makeBuilder());
const getUserMock = mock(() => Promise.resolve({ data: { user }, error: null }));

mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

const changeLanguageMock = mock(() => Promise.resolve());
mock.module("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { changeLanguage: changeLanguageMock },
  }),
}));

const { useUpdateUserSettings, useUserSettings } = await import("@/hooks/useUserSettings");
const { ToastContext } = await import("@/lib/toast-context");

const makeWrapper = (toastSpy: (message: string, kind: string) => void = () => {}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const stubToast = {
    toasts: [],
    toast: (message: string, kind: string) => {
      toastSpy(message, kind);
      return "";
    },
    dismiss: () => {},
  };
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(ToastContext, { value: stubToast as never }, children),
    );
};

beforeEach(() => {
  callLog = [];
  response = { data: null, error: null };
  user = { id: "user-1" };
  changeLanguageMock.mockClear();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

describe("useUserSettings", () => {
  test("未認証のときは null を返し、DB を参照しない", async () => {
    user = null;

    const { result } = renderHook(() => useUserSettings(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("設定が未作成（PGRST116）のときは null を返す", async () => {
    response = { data: null, error: { code: "PGRST116", message: "no rows" } };

    const { result } = renderHook(() => useUserSettings(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(changeLanguageMock).not.toHaveBeenCalled();
  });

  test("PGRST116 以外のエラーはエラーとして扱う", async () => {
    response = { data: null, error: { code: "42501", message: "denied" } };

    const { result } = renderHook(() => useUserSettings(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  test("取得した言語設定を i18n に反映する", async () => {
    response = { data: { user_id: "user-1", language: "en" }, error: null };

    const { result } = renderHook(() => useUserSettings(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => expect(changeLanguageMock).toHaveBeenCalledWith("en"));
    expect(callLog).toContainEqual({ method: "eq", args: ["user_id", "user-1"] });
  });
});

describe("useUpdateUserSettings", () => {
  test("user_id を付与して upsert し、言語を i18n に反映する", async () => {
    response = { data: { user_id: "user-1", language: "ja" }, error: null };

    const { result } = renderHook(() => useUpdateUserSettings(), { wrapper: makeWrapper() });

    act(() => {
      result.current.mutate({ language: "ja" });
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(callLog).toContainEqual({
      method: "upsert",
      args: [{ language: "ja", user_id: "user-1" }],
    });
    expect(changeLanguageMock).toHaveBeenCalledWith("ja");
  });

  test("オフライン時は offlineError トースト", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    const toastSpy = mock(() => {});

    const { result } = renderHook(() => useUpdateUserSettings(), {
      wrapper: makeWrapper(toastSpy),
    });

    act(() => {
      result.current.mutate({ language: "en" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(OfflineError);
    expect(toastSpy).toHaveBeenCalledWith("offlineError", "error");
  });

  test("未認証のときは unknownError トースト", async () => {
    user = null;
    const toastSpy = mock(() => {});

    const { result } = renderHook(() => useUpdateUserSettings(), {
      wrapper: makeWrapper(toastSpy),
    });

    act(() => {
      result.current.mutate({ language: "en" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastSpy).toHaveBeenCalledWith("unknownError", "error");
  });

  test("DB エラーは unknownError トースト", async () => {
    response = { data: null, error: new Error("db") };
    const toastSpy = mock(() => {});

    const { result } = renderHook(() => useUpdateUserSettings(), {
      wrapper: makeWrapper(toastSpy),
    });

    act(() => {
      result.current.mutate({ language: "en" });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(toastSpy).toHaveBeenCalledWith("unknownError", "error");
  });
});
