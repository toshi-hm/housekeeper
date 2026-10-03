import type { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

const removeClientMock = mock(() => Promise.resolve());

mock.module("@/lib/supabase", () => ({ supabase: {} }));
mock.module("@/lib/queryClient", () => ({ persister: { removeClient: removeClientMock } }));
mock.module("@/lib/requireOnline", () => ({
  OfflineError: class OfflineError extends Error {},
  requireOnline: () => undefined,
}));

const { resetCachesAfterHouseholdChange } = await import("@/hooks/useHousehold");
const { SUPABASE_REST_CACHE_NAME } = await import("@/lib/swCacheNames");

const originalCaches = (globalThis as { caches?: unknown }).caches;

beforeEach(() => {
  removeClientMock.mockClear();
});

afterEach(() => {
  (globalThis as { caches?: unknown }).caches = originalCaches;
});

describe("resetCachesAfterHouseholdChange", () => {
  test("クエリキャッシュ・永続化クライアント・SWのREST応答キャッシュをすべて破棄する", async () => {
    const clear = mock(() => undefined);
    const deleteCache = mock(() => Promise.resolve(true));
    (globalThis as { caches?: unknown }).caches = { delete: deleteCache };

    await resetCachesAfterHouseholdChange({ clear } as unknown as QueryClient);

    expect(clear).toHaveBeenCalledTimes(1);
    expect(removeClientMock).toHaveBeenCalledTimes(1);
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
