import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

mock.module("@/lib/supabase", () => ({ supabase: {} }));
mock.module("@/lib/requireOnline", () => ({
  ConcurrentUpdateError: class ConcurrentUpdateError extends Error {},
  OfflineError: class OfflineError extends Error {
    readonly isOffline = true;
  },
  requireOnline: () => undefined,
}));

const { resetCachesAfterHouseholdChange } = await import("@/hooks/useHousehold");
const { persister } = await import("@/lib/queryClient");
const { SUPABASE_REST_CACHE_NAME } = await import("@/lib/swCacheNames");

const originalCaches = (globalThis as { caches?: unknown }).caches;
let removeClientSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
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
