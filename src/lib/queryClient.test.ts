import { describe, expect, mock, test } from "bun:test";

const createStoreMock = mock((db: string, store: string) => ({ db, store }));
const getMock = mock(() => Promise.resolve("cached-value"));
const setMock = mock(() => Promise.resolve());
const delMock = mock(() => Promise.resolve());

mock.module("idb-keyval", () => ({
  createStore: createStoreMock,
  get: getMock,
  set: setMock,
  del: delMock,
}));

const { persister, queryClient } = await import("@/lib/queryClient");

describe("queryClient のデフォルト設定", () => {
  test("staleTime 5分 / retry 1 / gcTime 24時間 / mutations は online モード", () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(1000 * 60 * 5);
    expect(defaults.queries?.retry).toBe(1);
    expect(defaults.queries?.gcTime).toBe(1000 * 60 * 60 * 24);
    expect(defaults.mutations?.networkMode).toBe("online");
  });
});

describe("persister (IndexedDB ストレージ)", () => {
  test("housekeeper / query-cache の idb ストアを作成する", () => {
    expect(createStoreMock).toHaveBeenCalledWith("housekeeper", "query-cache");
  });

  test("restoreClient は housekeeper-query-cache キーで読み出す", async () => {
    getMock.mockImplementation(() => Promise.resolve(undefined as unknown as string));
    await persister.restoreClient();

    expect(getMock).toHaveBeenCalled();
    const [key, store] = getMock.mock.calls[0] as unknown as [string, { db: string }];
    expect(key).toBe("housekeeper-query-cache");
    expect(store).toEqual({ db: "housekeeper", store: "query-cache" });
  });

  test("removeClient は同じキーで削除する", async () => {
    await persister.removeClient();

    expect(delMock).toHaveBeenCalled();
    const [key] = delMock.mock.calls[0] as unknown as [string];
    expect(key).toBe("housekeeper-query-cache");
  });
});
