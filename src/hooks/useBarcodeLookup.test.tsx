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

describe("Branch カバレッジ補完 (useBarcodeLookup)", () => {
  test("fnError の message が undefined でも not_found になる", async () => {
    sb.enqueue("items", { data: null });
    sb.setInvokeResponse({ data: null, error: {} as { message: string } });

    const { result } = renderHook(() => useBarcodeLookup());

    await act(async () => {
      await result.current.lookup("4910");
    });

    expect(result.current.error).toBe("not_found");
  });

  test("ローカルヒットで署名 URL が取得できなければ image_url は undefined", async () => {
    sb.enqueue("items", { data: { name: "画像なし牛乳", image_path: "user-1/x.jpg" } });
    sb.setSignedUrlResponse({ data: null, error: null });

    const { result } = renderHook(() => useBarcodeLookup());

    let lookup: BarcodeLookupResult | undefined;
    await act(async () => {
      lookup = await result.current.lookup("4911");
    });

    expect(lookup?.product).toEqual({ name: "画像なし牛乳", image_url: undefined });
  });

  test("API 商品の description / brand が null なら undefined になる", async () => {
    sb.enqueue("items", { data: null });
    sb.setInvokeResponse({
      data: { product: { name: "素の商品", description: null, image_url: null, brand: null } },
      error: null,
    });

    const { result } = renderHook(() => useBarcodeLookup());

    let lookup: BarcodeLookupResult | undefined;
    await act(async () => {
      lookup = await result.current.lookup("4912");
    });

    expect(lookup?.product).toEqual({
      name: "素の商品",
      image_url: undefined,
      description: undefined,
      brand: undefined,
    });
  });
});

describe("Mutation hardening (useBarcodeLookup): クエリ内容の厳密検証", () => {
  test("ローカル検索のクエリ内容を完全一致で検証する", async () => {
    sb.enqueue("items", { data: { name: "牛乳", image_path: null } });

    const { result } = renderHook(() => useBarcodeLookup());
    await act(async () => {
      await result.current.lookup("4901234567890");
    });

    expect(sb.queriesFor("items")[0]?.ops).toEqual([
      { method: "select", args: ["name, image_path"] },
      { method: "eq", args: ["barcode", "4901234567890"] },
      { method: "is", args: ["deleted_at", null] },
      { method: "order", args: ["updated_at", { ascending: false }] },
      { method: "limit", args: [1] },
      { method: "maybeSingle", args: [] },
    ]);
  });

  test("署名 URL は item-images バケットに 50 分 (3000 秒) で発行する", async () => {
    sb.enqueue("items", { data: { name: "牛乳", image_path: "user-1/milk.jpg" } });

    const { result } = renderHook(() => useBarcodeLookup());
    await act(async () => {
      await result.current.lookup("4901");
    });

    expect(sb.storageCalls[0]).toEqual({
      bucket: "item-images",
      method: "createSignedUrl",
      args: ["user-1/milk.jpg", 3000],
    });
  });

  test("Edge Function は barcode-lookup 名でバーコードを渡して呼ばれる", async () => {
    sb.enqueue("items", { data: null });
    sb.setInvokeResponse({ data: { product: null }, error: null });

    const { result } = renderHook(() => useBarcodeLookup());
    await act(async () => {
      await result.current.lookup("4902");
    });

    expect(sb.invokeCalls[0]).toEqual({ name: "barcode-lookup", body: { barcode: "4902" } });
  });

  test("network 判定は fetch / network を含むときだけ", async () => {
    sb.enqueue("items", { data: null }, { data: null });
    const { result } = renderHook(() => useBarcodeLookup());

    sb.setInvokeResponse({ data: null, error: { message: "socket NETWORK down" } });
    await act(async () => {
      await result.current.lookup("1");
    });
    expect(result.current.error).toBe("network");

    sb.setInvokeResponse({ data: null, error: { message: "no such product" } });
    await act(async () => {
      await result.current.lookup("2");
    });
    expect(result.current.error).toBe("not_found");
  });
});
