import { beforeEach, describe, expect, mock, test } from "bun:test";

const rpcMock = mock(() => Promise.resolve({ data: null, error: null }));

mock.module("@/lib/supabase", () => ({
  supabase: { rpc: rpcMock },
}));

// requireOnline() は navigator.onLine を見るため、テスト環境ではオンライン扱いにしておく。
mock.module("@/lib/requireOnline", () => ({
  OfflineError: class OfflineError extends Error {
    readonly isOffline = true;
  },
  ConcurrentUpdateError: class ConcurrentUpdateError extends Error {},
  requireOnline: () => undefined,
}));

const { saveRecipe } = await import("@/hooks/useRecipes");

describe("saveRecipe (#1126)", () => {
  beforeEach(() => {
    rpcMock.mockClear();
    rpcMock.mockImplementation(() => Promise.resolve({ data: "recipe-1", error: null }));
  });

  test("レシピ本体と構成アイテムの入れ替えを単一のRPC呼び出しにまとめる", async () => {
    await saveRecipe({
      id: "recipe-1",
      name: "朝のコーヒー",
      items: [
        { item_id: "item-1", amount: 1 },
        { item_id: "item-2", amount: 0 }, // amount<=0 は保存対象外
        { item_id: "", amount: 1 }, // item_id 未選択も保存対象外
        { item_id: "item-3", amount: 2 },
      ],
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("save_recipe", {
      p_id: "recipe-1",
      p_name: "朝のコーヒー",
      p_items: [
        { item_id: "item-1", amount: 1 },
        { item_id: "item-3", amount: 2 },
      ],
    });
  });

  test("新規レシピの場合は p_id に null を渡す", async () => {
    await saveRecipe({ name: "新レシピ", items: [{ item_id: "item-1", amount: 1 }] });

    expect(rpcMock).toHaveBeenCalledWith("save_recipe", {
      p_id: null,
      p_name: "新レシピ",
      p_items: [{ item_id: "item-1", amount: 1 }],
    });
  });

  test("RPCがエラーを返した場合は例外を投げ、部分的な状態変化が起きたように見せない", async () => {
    rpcMock.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "network error" } }),
    );

    await expect(saveRecipe({ id: "recipe-1", name: "朝のコーヒー", items: [] })).rejects.toThrow(
      "network error",
    );
  });
});
