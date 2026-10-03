import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import { createElement, type ReactNode } from "react";

const rpcMock = mock(
  (_fn: string, _args: Record<string, unknown>) =>
    Promise.resolve({ error: null }) as Promise<{
      error: { code?: string; message?: string } | null;
    }>,
);

mock.module("@/lib/supabase", () => ({ supabase: { rpc: rpcMock } }));
mock.module("@/lib/requireOnline", () => ({
  ConcurrentUpdateError: class ConcurrentUpdateError extends Error {},
  OfflineError: class OfflineError extends Error {
    readonly isOffline = true;
  },
  requireOnline: () => undefined,
}));

const {
  HouseholdManagementError,
  resetCachesAfterHouseholdChange,
  useRemoveHouseholdMember,
  useRenameHousehold,
} = await import("@/hooks/useHousehold");
const { persister } = await import("@/lib/queryClient");
const { SUPABASE_REST_CACHE_NAME } = await import("@/lib/swCacheNames");

const originalCaches = (globalThis as { caches?: unknown }).caches;
let removeClientSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockImplementation(() => Promise.resolve({ error: null }));
  removeClientSpy = spyOn(persister, "removeClient").mockResolvedValue(undefined);
});

afterEach(() => {
  removeClientSpy.mockRestore();
  (globalThis as { caches?: unknown }).caches = originalCaches;
});

describe("resetCachesAfterHouseholdChange", () => {
  test("クエリキャッシュ・永続化クライアント・SWのREST応答キャッシュをすべて破棄する", async () => {
    const clear = mock(() => undefined);
    const deleteCache = mock(() => Promise.resolve(true));
    (globalThis as { caches?: unknown }).caches = { delete: deleteCache };

    await resetCachesAfterHouseholdChange({ clear } as unknown as QueryClient);

    expect(clear).toHaveBeenCalledTimes(1);
    expect(removeClientSpy).toHaveBeenCalledTimes(1);
    expect(deleteCache).toHaveBeenCalledWith(SUPABASE_REST_CACHE_NAME);
  });

  test("Cache Storage APIが無い環境でも失敗しない", async () => {
    const clear = mock(() => undefined);
    (globalThis as { caches?: unknown }).caches = undefined;

    await expect(
      resetCachesAfterHouseholdChange({ clear } as unknown as QueryClient),
    ).resolves.toBeUndefined();
    expect(clear).toHaveBeenCalledTimes(1);
  });
});

const makeClient = () => {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  return { invalidate, wrapper };
};

describe("useRenameHousehold", () => {
  test("rename_household RPC を呼び、世帯キャッシュを無効化する", async () => {
    const { invalidate, wrapper } = makeClient();
    const { result } = renderHook(() => useRenameHousehold(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("Our Home");
    });

    expect(rpcMock).toHaveBeenCalledWith("rename_household", { p_name: "Our Home" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["household"] });
  });

  test("既知のエラーコードは HouseholdManagementError に変換する", async () => {
    rpcMock.mockImplementation(() => Promise.resolve({ error: { code: "HK010" } }));
    const { wrapper } = makeClient();
    const { result } = renderHook(() => useRenameHousehold(), { wrapper });

    const rejection = await act(async () =>
      result.current.mutateAsync("x").catch((e: unknown) => e),
    );

    expect(rejection).toBeInstanceOf(HouseholdManagementError);
    expect((rejection as InstanceType<typeof HouseholdManagementError>).code).toBe("HK010");
  });

  test("未知のエラーはそのまま投げる", async () => {
    const unknown = { code: "XX000", message: "boom" };
    rpcMock.mockImplementation(() => Promise.resolve({ error: unknown }));
    const { wrapper } = makeClient();
    const { result } = renderHook(() => useRenameHousehold(), { wrapper });

    const rejection = await act(async () =>
      result.current.mutateAsync("x").catch((e: unknown) => e),
    );

    expect(rejection).toBe(unknown);
  });
});

describe("useRemoveHouseholdMember", () => {
  test("remove_household_member RPC を呼び、世帯キャッシュを無効化する", async () => {
    const { invalidate, wrapper } = makeClient();
    const { result } = renderHook(() => useRemoveHouseholdMember(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("member-1");
    });

    expect(rpcMock).toHaveBeenCalledWith("remove_household_member", { p_user_id: "member-1" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["household"] });
  });

  test.each(["HK010", "HK012", "HK013"] as const)(
    "%s は HouseholdManagementError に変換する",
    async (code) => {
      rpcMock.mockImplementation(() => Promise.resolve({ error: { code } }));
      const { wrapper } = makeClient();
      const { result } = renderHook(() => useRemoveHouseholdMember(), { wrapper });

      const rejection = await act(async () =>
        result.current.mutateAsync("member-1").catch((e: unknown) => e),
      );

      expect(rejection).toBeInstanceOf(HouseholdManagementError);
      expect((rejection as InstanceType<typeof HouseholdManagementError>).code).toBe(code);
    },
  );
});
