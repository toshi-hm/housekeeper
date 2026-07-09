import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { createSupabaseMock } from "@/test/supabaseMock";
import type { BarcodeLookupResult } from "@/types/barcode";

const sb = createSupabaseMock();
mock.module("@/lib/supabase", () => ({ supabase: sb.supabase }));

const { useBarcodeLookup } = await import("@/hooks/useBarcodeLookup");

beforeEach(() => {
  sb.reset();
});

describe("useBarcodeLookup", () => {
  test("空のバーコードは即座に null を返す", async () => {
    const { result } = renderHook(() => useBarcodeLookup());

    let lookup: BarcodeLookupResult | undefined;
    await act(async () => {
      lookup = await result.current.lookup("   ");
    });

    expect(lookup).toEqual({ product: null, source: null });
    expect(sb.queries).toHaveLength(0);
  });

  test("ローカル DB ヒット (画像なし) → source: db", async () => {
    sb.enqueue("items", { data: { name: "牛乳", image_path: null } });

    const { result } = renderHook(() => useBarcodeLookup());

    let lookup: BarcodeLookupResult | undefined;
    await act(async () => {
      lookup = await result.current.lookup("4901");
    });

    expect(lookup).toEqual({ product: { name: "牛乳", image_url: undefined }, source: "db" });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test("ローカル DB ヒット (画像あり) → 署名 URL を取得する", async () => {
    sb.enqueue("items", { data: { name: "牛乳", image_path: "user-1/item.jpg" } });
    sb.setSignedUrlResponse({ data: { signedUrl: "https://signed.example/milk" }, error: null });

    const { result } = renderHook(() => useBarcodeLookup());

    let lookup: BarcodeLookupResult | undefined;
    await act(async () => {
      lookup = await result.current.lookup("4901");
    });

    expect(lookup?.product?.image_url).toBe("https://signed.example/milk");
    expect(sb.storageCalls[0]?.method).toBe("createSignedUrl");
  });

  test("ローカル未ヒット → Edge Function から取得 (source: api)", async () => {
    sb.enqueue("items", { data: null });
    sb.setInvokeResponse({
      data: {
        product: {
          name: "緑茶",
          description: "お茶",
          image_url: "https://img.example/tea.jpg",
          brand: "ブランド",
        },
      },
      error: null,
    });

    const { result } = renderHook(() => useBarcodeLookup());

    let lookup: BarcodeLookupResult | undefined;
    await act(async () => {
      lookup = await result.current.lookup("4902");
    });

    expect(lookup).toEqual({
      product: {
        name: "緑茶",
        image_url: "https://img.example/tea.jpg",
        description: "お茶",
        brand: "ブランド",
      },
      source: "api",
    });
  });

  test("API が product: null → 見つからない", async () => {
    sb.enqueue("items", { data: null });
    sb.setInvokeResponse({ data: { product: null }, error: null });

    const { result } = renderHook(() => useBarcodeLookup());

    let lookup: BarcodeLookupResult | undefined;
    await act(async () => {
      lookup = await result.current.lookup("4903");
    });

    expect(lookup).toEqual({ product: null, source: null });
  });

  test("API のネットワークエラー → error: network", async () => {
    sb.enqueue("items", { data: null });
    sb.setInvokeResponse({ data: null, error: { message: "Failed to fetch" } });

    const { result } = renderHook(() => useBarcodeLookup());

    await act(async () => {
      await result.current.lookup("4904");
    });

    expect(result.current.error).toBe("network");
  });

  test("API のその他エラー → error: not_found", async () => {
    sb.enqueue("items", { data: null });
    sb.setInvokeResponse({ data: null, error: { message: "404 not found" } });

    const { result } = renderHook(() => useBarcodeLookup());

    await act(async () => {
      await result.current.lookup("4905");
    });

    expect(result.current.error).toBe("not_found");
  });

  test("invoke が TypeError を投げたら network エラー", async () => {
    sb.enqueue("items", { data: null });
    sb.setInvokeRejection(new TypeError("Failed to fetch"));

    const { result } = renderHook(() => useBarcodeLookup());

    let lookup: BarcodeLookupResult | undefined;
    await act(async () => {
      lookup = await result.current.lookup("4906");
    });

    expect(lookup).toEqual({ product: null, source: null });
    expect(result.current.error).toBe("network");
  });

  test("invoke がその他の例外を投げたら not_found", async () => {
    sb.enqueue("items", { data: null });
    sb.setInvokeRejection(new Error("something broke"));

    const { result } = renderHook(() => useBarcodeLookup());

    await act(async () => {
      await result.current.lookup("4907");
    });

    expect(result.current.error).toBe("not_found");
  });
});
