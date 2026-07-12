import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

const createSignedUrlsMock = mock(
  (paths: string[]): Promise<{ data: { path: string; signedUrl: string }[]; error: null }> =>
    Promise.resolve({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}` })),
      error: null,
    }),
);

mock.module("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrls: createSignedUrlsMock,
      }),
    },
  },
}));

const { useSignedItemImages } = await import("@/hooks/useItemImage");

const makeWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

describe("useSignedItemImages", () => {
  test("複数アイテムの画像パスをまとめて1回のcreateSignedUrls呼び出しで取得する", async () => {
    createSignedUrlsMock.mockClear();
    const { result } = renderHook(() => useSignedItemImages(["a/1.jpg", "a/2.jpg", "a/3.jpg"]), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(createSignedUrlsMock).toHaveBeenCalledTimes(1);
    expect(createSignedUrlsMock.mock.calls[0]?.[0]).toEqual(["a/1.jpg", "a/2.jpg", "a/3.jpg"]);
    expect(result.current.data).toEqual({
      "a/1.jpg": "https://signed.example/a/1.jpg",
      "a/2.jpg": "https://signed.example/a/2.jpg",
      "a/3.jpg": "https://signed.example/a/3.jpg",
    });
  });

  test("null/undefined/重複パスを除外してから問い合わせる", async () => {
    createSignedUrlsMock.mockClear();
    const { result } = renderHook(
      () => useSignedItemImages(["a/1.jpg", null, undefined, "a/1.jpg", "a/2.jpg"]),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.data).toBeDefined());

    expect(createSignedUrlsMock).toHaveBeenCalledTimes(1);
    expect(createSignedUrlsMock.mock.calls[0]?.[0]).toEqual(["a/1.jpg", "a/2.jpg"]);
  });

  test("有効なパスが1件もない場合はcreateSignedUrlsを呼ばない", () => {
    createSignedUrlsMock.mockClear();
    const { result } = renderHook(() => useSignedItemImages([null, undefined]), {
      wrapper: makeWrapper(),
    });

    expect(createSignedUrlsMock).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});
