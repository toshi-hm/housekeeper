import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

const responseQueues: Record<string, SupabaseResponse[]> = {};

/** テーブルごとのクエリビルダーメソッド呼び出し（メソッド名 + 引数）を記録する。
 *  「削除済みアイテムのロットが混入する」(#1023) の再発防止には、突き合わせ後の
 *  結果だけでなく、`items` クエリに `deleted_at IS NULL` 相当のフィルタが実際に
 *  かかっていることの検証が必要なため。 */
const queryCalls: Record<string, string[]> = {};

const makeBuilder = (table: string) => {
  const builder: Record<string, unknown> = {};
  const chainMethod =
    (method: string) =>
    (...args: unknown[]) => {
      (queryCalls[table] ??= []).push(
        `${method}(${args.map((arg) => JSON.stringify(arg)).join(", ")})`,
      );
      return builder;
    };
  Object.assign(builder, {
    select: chainMethod("select"),
    eq: chainMethod("eq"),
    not: chainMethod("not"),
    is: chainMethod("is"),
    order: chainMethod("order"),
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
  for (const key of Object.keys(queryCalls)) delete queryCalls[key];
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

    // 上のアサーションは「items クエリが最初から deleted_at IS NULL でフィルタされている」
    // という前提（モックの responseQueues.items）に依存しているため、その前提自体が
    // 崩れていないか（`useActiveItemNames` が実際にそのフィルタを発行しているか）を
    // 直接検証する。これが無いと、フィルタを丸ごと消しても本テストは通ってしまう。
    expect(queryCalls.items).toContain('is("deleted_at", null)');
  });
});
