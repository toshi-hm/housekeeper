import { beforeEach, describe, expect, mock, test } from "bun:test";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

let responsesByRange: Record<string, unknown[]> = {};

const makeBuilder = () => {
  const builder: Record<string, unknown> = {};
  const chainMethod = () => () => builder;

  Object.assign(builder, {
    select: chainMethod(),
    eq: chainMethod(),
    is: chainMethod(),
    or: chainMethod(),
    order: chainMethod(),
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

const { fetchItems } = await import("@/hooks/useItems");

describe("fetchItems pagination (#622)", () => {
  beforeEach(() => {
    fromMock.mockClear();
    responsesByRange = {};
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
