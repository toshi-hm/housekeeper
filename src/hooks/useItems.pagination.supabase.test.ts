import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

let responsesByRange: Record<string, unknown[]> = {};
let orderCalls: Array<[string, Record<string, unknown> | undefined]> = [];

const makeBuilder = () => {
  const builder: Record<string, unknown> = {};
  const chainMethod = () => () => builder;

  Object.assign(builder, {
    select: chainMethod(),
    eq: chainMethod(),
    is: chainMethod(),
    not: chainMethod(),
    gt: chainMethod(),
    or: chainMethod(),
    order: (column: string, options?: Record<string, unknown>) => {
      orderCalls.push([column, options]);
      return builder;
    },
    range: (from: number, to: number) => {
      const key = `${from}-${to}`;
      const data = responsesByRange[key] ?? [];
      return Promise.resolve({ data, error: null } as SupabaseResponse);
    },
  });
  return builder;
};

const fromMock = mock(() => makeBuilder());
const getUserMock = mock(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }));

mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

const { fetchItems, useItemsForExport, useItemsWithExpiry, useDeletedItems } =
  await import("@/hooks/useItems");

const makeWrapper = (qc: QueryClient) => {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
};

const newQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

describe("fetchItems pagination (#622)", () => {
  beforeEach(() => {
    fromMock.mockClear();
    responsesByRange = {};
    orderCalls = [];
  });

  test("1000件ちょうどのページが返ると次のページも取得し、結合した全件を返す", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({ id: `item-${i}` }));
    const secondPage = [{ id: "item-1000" }, { id: "item-1001" }];
    responsesByRange = {
      "0-999": firstPage,
      "1000-1999": secondPage,
    };

    const result = await fetchItems();

    expect(result.length).toBe(1002);
  });

  test("1ページに収まる場合は1回のrange呼び出しで完了する", async () => {
    responsesByRange = { "0-999": [{ id: "item-1" }, { id: "item-2" }] };

    const result = await fetchItems();

    expect(result.length).toBe(2);
  });
});

describe("fetchItems の並び順とnull扱い (#1038)", () => {
  beforeEach(() => {
    fromMock.mockClear();
    responsesByRange = { "0-999": [] };
    orderCalls = [];
  });

  test("purchase_date降順ソートはnullsFirst:falseを指定する（クライアント側の再ソートと揃える）", async () => {
    await fetchItems({}, "purchase_date");

    expect(orderCalls).toContainEqual(["purchase_date", { ascending: false, nullsFirst: false }]);
  });

  test("created_at降順ソート（デフォルト）もnullsFirst:falseを指定する", async () => {
    await fetchItems({}, "created_at");

    expect(orderCalls).toContainEqual(["created_at", { ascending: false, nullsFirst: false }]);
  });

  test("expiry_dateソートは従来通り昇順・nullsFirst:falseのまま", async () => {
    await fetchItems({}, "expiry_date");

    expect(orderCalls).toContainEqual(["expiry_date", { ascending: true, nullsFirst: false }]);
  });
});

describe("useItemsForExport pagination (#802)", () => {
  beforeEach(() => {
    fromMock.mockClear();
    responsesByRange = {};
  });

  test("1000件ちょうどのページが返ると次のページも取得し、結合した全件を返す", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({ id: `item-${i}` }));
    const secondPage = [{ id: "item-1000" }, { id: "item-1001" }];
    responsesByRange = { "0-999": firstPage, "1000-1999": secondPage };

    const { result } = renderHook(() => useItemsForExport(), {
      wrapper: makeWrapper(newQueryClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.length).toBe(1002);
  });
});

describe("useItemsWithExpiry pagination (#802)", () => {
  beforeEach(() => {
    fromMock.mockClear();
    responsesByRange = {};
  });

  test("1000件ちょうどのページが返ると次のページも取得し、結合した全件を返す", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({ id: `item-${i}` }));
    const secondPage = [{ id: "item-1000" }];
    responsesByRange = { "0-999": firstPage, "1000-1999": secondPage };

    const { result } = renderHook(() => useItemsWithExpiry(), {
      wrapper: makeWrapper(newQueryClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.length).toBe(1001);
  });
});

describe("useDeletedItems pagination (#802)", () => {
  beforeEach(() => {
    fromMock.mockClear();
    responsesByRange = {};
  });

  test("1000件ちょうどのページが返ると次のページも取得し、結合した全件を返す", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, i) => ({ id: `item-${i}` }));
    const secondPage = [{ id: "item-1000" }];
    responsesByRange = { "0-999": firstPage, "1000-1999": secondPage };

    const { result } = renderHook(() => useDeletedItems(), {
      wrapper: makeWrapper(newQueryClient()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.length).toBe(1001);
  });
});
