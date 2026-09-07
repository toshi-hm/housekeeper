import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

const responseQueues: Record<string, SupabaseResponse[]> = {};

const makeBuilder = (table: string) => {
  const builder: Record<string, unknown> = {};
  const chainMethod = () => () => builder;
  Object.assign(builder, {
    select: chainMethod(),
    eq: chainMethod(),
    not: chainMethod(),
    is: chainMethod(),
    order: chainMethod(),
    range: () => {
      const queue = responseQueues[table];
      const response = queue && queue.length > 0 ? queue.shift()! : { data: [], error: null };
      return Promise.resolve(response);
    },
  });
  return builder;
};

const fromMock = mock((table: string) => makeBuilder(table));
const getUserMock = mock(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }));

mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

const { useReceiptPriceHistory } = await import("@/hooks/useReceiptPriceHistory");

const makeWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

beforeEach(() => {
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
});

describe("useReceiptPriceHistory (#1023)", () => {
  test("削除済み(アーカイブ済み)アイテムのロットは価格履歴から除外される", async () => {
    responseQueues.item_lots = [
      {
        data: [
          {
            item_id: "item-active",
            store_name: "スーパーA",
            unit_price: 200,
            purchase_date: "2026-07-01",
            created_at: "2026-07-01T00:00:00.000Z",
          },
          {
            item_id: "item-deleted",
            store_name: "スーパーA",
            unit_price: 300,
            purchase_date: "2026-07-02",
            created_at: "2026-07-02T00:00:00.000Z",
          },
        ],
        error: null,
      },
    ];
    // items テーブルへのクエリは deleted_at IS NULL でフィルタされるため、
    // 削除済みアイテム(item-deleted)はそもそも結果に含まれない。
    responseQueues.items = [
      {
        data: [{ id: "item-active", name: "牛乳" }],
        error: null,
      },
    ];

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useReceiptPriceHistory(), {
      wrapper: makeWrapper(queryClient),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.data).toEqual([
      {
        itemName: "牛乳",
        storeName: "スーパーA",
        unitPrice: 200,
        purchaseDate: "2026-07-01",
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ]);
  });
});
