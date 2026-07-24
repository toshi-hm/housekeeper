import { beforeEach, describe, expect, mock, test } from "bun:test";

const rpcMock = mock(() => Promise.resolve({ data: null, error: null }));

mock.module("@/lib/supabase", () => ({
  supabase: { rpc: rpcMock },
}));

// requireOnline() は navigator.onLine を見るため、テスト環境ではオンライン扱いにしておく
mock.module("@/lib/requireOnline", () => ({
  OfflineError: class OfflineError extends Error {
    readonly isOffline = true;
  },
  requireOnline: () => undefined,
}));

const { saveTemplate } = await import("@/hooks/useShoppingTemplates");

describe("saveTemplate (#573)", () => {
  beforeEach(() => {
    rpcMock.mockClear();
    rpcMock.mockImplementation(() => Promise.resolve({ data: "template-1", error: null }));
  });

  test("テンプレート本体とアイテムの入れ替えを単一のRPC呼び出しにまとめる", async () => {
    await saveTemplate({
      id: "template-1",
      name: "定番セット",
      items: [
        { name: "牛乳", desired_units: 1 },
        { name: "  ", desired_units: 1 },
        { name: " 卵 ", desired_units: 2 },
      ],
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith("save_shopping_list_template", {
      p_id: "template-1",
      p_name: "定番セット",
      p_items: [
        { name: "牛乳", desired_units: 1 },
        { name: "卵", desired_units: 2 },
      ],
    });
  });

  test("新規テンプレートの場合は p_id に null を渡す", async () => {
    await saveTemplate({ name: "新セット", items: [{ name: "パン", desired_units: 1 }] });

    expect(rpcMock).toHaveBeenCalledWith("save_shopping_list_template", {
      p_id: null,
      p_name: "新セット",
      p_items: [{ name: "パン", desired_units: 1 }],
    });
  });

  test("RPCがエラーを返した場合は例外を投げ、部分的な状態変化が起きたように見せない", async () => {
    rpcMock.mockImplementation(() =>
      Promise.resolve({ data: null, error: { message: "network error" } }),
    );

    await expect(saveTemplate({ id: "template-1", name: "定番セット", items: [] })).rejects.toThrow(
      "network error",
    );
  });
});
