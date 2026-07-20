import { beforeEach, describe, expect, mock, test } from "bun:test";

const rpcMock = mock(() => Promise.resolve({ data: 2, error: null }));

mock.module("@/lib/supabase", () => ({
  supabase: { rpc: rpcMock },
}));

mock.module("@/lib/requireOnline", () => ({
  ConcurrentUpdateError: class ConcurrentUpdateError extends Error {},
  OfflineError: class OfflineError extends Error {
    readonly isOffline = true;
  },
  requireOnline: () => undefined,
}));

const { archivePurchasedItems } = await import("@/hooks/useShoppingList");

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockImplementation(() => Promise.resolve({ data: 2, error: null }));
});

describe("archivePurchasedItems", () => {
  test("購入済み行の移動を単一のtransactional RPCへ委譲する", async () => {
    await archivePurchasedItems();

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("archive_purchased_shopping_items", {});
  });

  test("対象が0件の冪等な再実行も成功する", async () => {
    rpcMock.mockImplementationOnce(() => Promise.resolve({ data: 0, error: null }));

    await expect(archivePurchasedItems()).resolves.toBeUndefined();
  });

  test("RPCエラーを呼び出し側へ返す", async () => {
    rpcMock.mockImplementationOnce(() =>
      Promise.resolve({ data: null, error: { message: "archive failed" } }),
    );

    await expect(archivePurchasedItems()).rejects.toThrow("archive failed");
  });
});
