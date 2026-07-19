import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, mock, spyOn, test } from "bun:test";
import { createElement, type ReactNode } from "react";

import { queryClient as appQueryClient } from "@/lib/queryClient";

const createSignedUrlsMock = mock(
  (paths: string[]): Promise<{ data: { path: string; signedUrl: string }[]; error: null }> =>
    Promise.resolve({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}` })),
      error: null,
    }),
);

const uploadMock = mock(() => Promise.resolve({ error: null }));
const removeMock = mock(() => Promise.resolve({ error: null }));
const updateEqMock = mock(() => Promise.resolve({ error: null }));
const getUserMock = mock(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }));

mock.module("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: getUserMock },
    storage: {
      from: () => ({
        createSignedUrls: createSignedUrlsMock,
        upload: uploadMock,
        remove: removeMock,
      }),
    },
    from: () => ({
      update: () => ({ eq: updateEqMock }),
    }),
  },
}));

const { useSignedItemImages, uploadItemImage } = await import("@/hooks/useItemImage");

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

describe("uploadItemImage", () => {
  test("アップロード成功後にitem-image / item-imagesキャッシュを無効化する", async () => {
    const invalidateSpy = spyOn(appQueryClient, "invalidateQueries").mockResolvedValue();
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });

    const path = await uploadItemImage({ itemId: "item-1", file });

    expect(path).toBe("user-1/item-1.jpg");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["item-image"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["item-images"] });
    invalidateSpy.mockRestore();
  });

  test("同じ拡張子で再アップロードしても(パスが変わらなくても)キャッシュを無効化する", async () => {
    const invalidateSpy = spyOn(appQueryClient, "invalidateQueries").mockResolvedValue();
    const file = new File(["x"], "photo.jpg", { type: "image/jpeg" });

    await uploadItemImage({ itemId: "item-1", file, oldImagePath: "user-1/item-1.jpg" });

    // removeが呼ばれない(パス不変)ケースでも、キャッシュ無効化は必ず実行される。
    expect(removeMock).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["item-image"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["item-images"] });
    invalidateSpy.mockRestore();
  });
});
