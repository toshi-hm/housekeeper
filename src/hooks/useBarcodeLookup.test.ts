import { FunctionsHttpError } from "@supabase/supabase-js";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";

const getUserMock = mock(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }));

// ローカルの items テーブル照合は常に「一致なし」を返し、必ず
// barcode-lookup Edge Function 呼び出しに進むようにする。
const noLocalMatchBuilder: Record<string, unknown> = {};
Object.assign(noLocalMatchBuilder, {
  select: () => noLocalMatchBuilder,
  eq: () => noLocalMatchBuilder,
  is: () => noLocalMatchBuilder,
  order: () => noLocalMatchBuilder,
  limit: () => noLocalMatchBuilder,
  maybeSingle: () => Promise.resolve({ data: null, error: null }),
});
const noTagsBuilder: Record<string, unknown> = {};
Object.assign(noTagsBuilder, {
  select: () => noTagsBuilder,
  eq: () => Promise.resolve({ data: [], error: null }),
});
const fromMock = mock((table: string) => (table === "items" ? noLocalMatchBuilder : noTagsBuilder));

let invokeResponse: { data: unknown; error: { message: string } | FunctionsHttpError | null } = {
  data: null,
  error: null,
};
const invokeMock = mock(() => Promise.resolve(invokeResponse));

mock.module("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: getUserMock },
    from: fromMock,
    functions: { invoke: invokeMock },
    storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null }) }) },
  },
}));

const { useBarcodeLookup } = await import("@/hooks/useBarcodeLookup");

beforeEach(() => {
  fromMock.mockClear();
  fromMock.mockImplementation((table: string) =>
    table === "items" ? noLocalMatchBuilder : noTagsBuilder,
  );
  invokeMock.mockClear();
  invokeResponse = { data: null, error: null };
});

describe("useBarcodeLookup (#655)", () => {
  test("DBで一致した商品は再登録用の設定とタグを返す (#1106)", async () => {
    const itemBuilder: Record<string, unknown> = {};
    const item = {
      id: "item-1",
      name: "牛乳",
      image_path: null,
      category_id: "category-1",
      item_type: "food",
      content_amount: 900,
      content_unit: "ml",
      expiry_type: "use_by",
      notes: "低脂肪",
      minimum_stock: 2,
      days_use_after_opening: 5,
      unit_price: 198,
      store_name: "スーパー",
      auto_reorder: true,
      reorder_threshold: 1,
      reorder_lead_days: 3,
    };
    Object.assign(itemBuilder, {
      select: () => itemBuilder,
      eq: () => itemBuilder,
      is: () => itemBuilder,
      order: () => itemBuilder,
      limit: () => itemBuilder,
      maybeSingle: () => Promise.resolve({ data: item, error: null }),
    });
    const tagsBuilder: Record<string, unknown> = {};
    Object.assign(tagsBuilder, {
      select: () => tagsBuilder,
      eq: () => Promise.resolve({ data: [{ tag_id: "tag-1" }], error: null }),
    });
    fromMock.mockImplementation((table: string) => (table === "items" ? itemBuilder : tagsBuilder));

    const { result } = renderHook(() => useBarcodeLookup());
    const lookupResult = await result.current.lookup("4901234567894");

    expect(lookupResult.source).toBe("db");
    expect(lookupResult.itemDefaults).toMatchObject({
      category_id: "category-1",
      item_type: "food",
      content_amount: 900,
      content_unit: "ml",
      expiry_type: "use_by",
      minimum_stock: 2,
      auto_reorder: true,
    });
    expect(lookupResult.tagIds).toEqual(["tag-1"]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  test("Edge Functionが400 (invalid_barcode) を返した場合はserver_errorになる", async () => {
    invokeResponse = {
      data: null,
      error: { message: "Edge Function returned a non-2xx status code" },
    };
    const { result } = renderHook(() => useBarcodeLookup());

    const lookupResult = await result.current.lookup("123");

    expect(lookupResult).toEqual({ product: null, source: null });
    await waitFor(() => expect(result.current.error).toBe("server_error"));
  });

  test("Edge Functionが500 (missing_api_config/internal_error) を返した場合もserver_errorになる", async () => {
    invokeResponse = { data: null, error: { message: "FunctionsHttpError: 500" } };
    const { result } = renderHook(() => useBarcodeLookup());

    await result.current.lookup("4901234567894");

    await waitFor(() => expect(result.current.error).toBe("server_error"));
  });

  test("ネットワークエラーの場合はnetworkになる", async () => {
    invokeResponse = { data: null, error: { message: "Failed to fetch" } };
    const { result } = renderHook(() => useBarcodeLookup());

    await result.current.lookup("4901234567894");

    await waitFor(() => expect(result.current.error).toBe("network"));
  });

  test("Edge Functionが504 (timeout) を返した場合はtimeoutになる (#709)", async () => {
    invokeResponse = { data: null, error: new FunctionsHttpError({ status: 504 }) };
    const { result } = renderHook(() => useBarcodeLookup());

    const lookupResult = await result.current.lookup("4901234567894");

    expect(lookupResult).toEqual({ product: null, source: null });
    await waitFor(() => expect(result.current.error).toBe("timeout"));
  });

  test("Edge Functionが429 (rate_limited) を返した場合はrate_limitedになる (#803)", async () => {
    invokeResponse = { data: null, error: new FunctionsHttpError({ status: 429 }) };
    const { result } = renderHook(() => useBarcodeLookup());

    const lookupResult = await result.current.lookup("4901234567894");

    expect(lookupResult).toEqual({ product: null, source: null });
    await waitFor(() => expect(result.current.error).toBe("rate_limited"));
  });

  test("商品が見つからない場合(200 + product:null)はerrorを設定しない", async () => {
    invokeResponse = { data: { product: null }, error: null };
    const { result } = renderHook(() => useBarcodeLookup());

    const lookupResult = await result.current.lookup("4901234567894");

    expect(lookupResult).toEqual({ product: null, source: null });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
  });

  test("商品が見つかった場合はsource: apiで返す", async () => {
    invokeResponse = {
      data: { product: { name: "牛乳", description: null, image_url: null, brand: null } },
      error: null,
    };
    const { result } = renderHook(() => useBarcodeLookup());

    const lookupResult = await result.current.lookup("4901234567894");

    expect(lookupResult.source).toBe("api");
    expect(lookupResult.product?.name).toBe("牛乳");
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
  });
});
