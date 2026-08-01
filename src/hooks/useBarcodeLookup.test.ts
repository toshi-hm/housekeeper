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
const fromMock = mock(() => noLocalMatchBuilder);

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
  invokeMock.mockClear();
  invokeResponse = { data: null, error: null };
});

describe("useBarcodeLookup (#655)", () => {
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
