import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

const createSignedUrlsMock = mock(
  (paths: string[]): Promise<{ data: { path: string; signedUrl: string }[]; error: null }> =>
    Promise.resolve({
      data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}` })),
      error: null,
    }),
);

const events: string[] = [];
const uploadMock = mock(() =>
  Promise.resolve({ data: { path: "user-1/item-1.jpg" }, error: null }),
);
const removeMock = mock((paths: string[]) => {
  events.push(`remove:${paths.join(",")}`);
  return Promise.resolve({ error: null });
});
const updateEqMock = mock(() => {
  events.push("update");
  return Promise.resolve({ error: null });
});
const updateMock = mock(() => ({ eq: updateEqMock }));
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
    from: () => ({ update: updateMock }),
  },
}));

const { uploadItemImage, useSignedItemImages } = await import("@/hooks/useItemImage");

const makeQueryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const makeWrapper = () => {
  const queryClient = makeQueryClient();
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

afterEach(() => {
  events.length = 0;
  uploadMock.mockReset();
  uploadMock.mockImplementation(() =>
    Promise.resolve({ data: { path: "user-1/item-1.jpg" }, error: null }),
  );
  removeMock.mockClear();
  getUserMock.mockClear();
  updateMock.mockClear();
  updateEqMock.mockReset();
  updateEqMock.mockImplementation(() => {
    events.push("update");
    return Promise.resolve({ error: null });
  });
});

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
  test("DB更新成功後にだけ旧画像を削除する", async () => {
    const file = new File([new Uint8Array(100)], "photo.webp", { type: "image/webp" });
    const queryClient = makeQueryClient();

    const path = await uploadItemImage({
      itemId: "item-1",
      file,
      oldImagePath: "user-1/item-1.jpg",
      queryClient,
    });

    expect(path).toBe("user-1/item-1.webp");
    expect(uploadMock).toHaveBeenCalledWith("user-1/item-1.webp", file, {
      upsert: true,
      contentType: "image/webp",
    });
    expect(updateMock).toHaveBeenCalledWith({ image_path: "user-1/item-1.webp" });
    expect(updateEqMock).toHaveBeenCalledWith("id", "item-1");
    expect(events).toEqual(["update", "remove:user-1/item-1.jpg"]);
  });

  test("DB更新失敗時は新画像をrollbackし、旧画像を残す", async () => {
    updateEqMock.mockImplementationOnce(() => {
      events.push("update");
      return Promise.resolve({ error: { message: "db failed" } });
    });
    const file = new File([new Uint8Array(100)], "photo.webp", { type: "image/webp" });
    const queryClient = makeQueryClient();

    await expect(
      uploadItemImage({
        itemId: "item-1",
        file,
        oldImagePath: "user-1/item-1.jpg",
        queryClient,
      }),
    ).rejects.toThrow("db failed");

    expect(events).toEqual(["update", "remove:user-1/item-1.webp"]);
    expect(removeMock).not.toHaveBeenCalledWith(["user-1/item-1.jpg"]);
  });

  test("同じパスへの上書き後にDB更新が失敗しても参照中objectを削除しない", async () => {
    updateEqMock.mockImplementationOnce(() => {
      events.push("update");
      return Promise.resolve({ error: { message: "db failed" } });
    });
    const file = new File([new Uint8Array(100)], "photo.webp", { type: "image/webp" });
    const queryClient = makeQueryClient();

    await expect(
      uploadItemImage({
        itemId: "item-1",
        file,
        oldImagePath: "user-1/item-1.webp",
        queryClient,
      }),
    ).rejects.toThrow("db failed");

    expect(events).toEqual(["update"]);
    expect(removeMock).not.toHaveBeenCalled();
  });

  // #564: 同じ拡張子で画像を差し替えるとStorageパス(=queryKey)が変わらないため、
  // アップロード成功後に古い署名付きURLキャッシュを明示的に無効化しないと、
  // staleTime(最大49分)の間、差し替え前の画像URLが表示され続けてしまう。
  test("アップロード成功後、同じパスのuseSignedItemImage/useSignedItemImagesキャッシュを無効化する", async () => {
    uploadMock.mockClear();
    getUserMock.mockClear();
    updateEqMock.mockClear();

    const path = "user-1/item-1.jpg";
    const queryClient = makeQueryClient();

    // 差し替え前の署名付きURLをキャッシュに事前投入しておく。
    queryClient.setQueryData(["item-image", path], "https://signed.example/stale-single");
    queryClient.setQueryData(["item-images", [path]], {
      [path]: "https://signed.example/stale-batch",
    });
    // 無関係なキャッシュはそのまま残ることを確認するための対照群。
    queryClient.setQueryData(["item-image", "user-1/other.jpg"], "https://signed.example/other");

    const file = new File(["dummy"], "photo.jpg", { type: "image/jpeg" });
    const returnedPath = await uploadItemImage({ itemId: "item-1", file, queryClient });

    expect(returnedPath).toBe(path);
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(updateEqMock).toHaveBeenCalledTimes(1);

    expect(queryClient.getQueryState(["item-image", path])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["item-images", [path]])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(["item-image", "user-1/other.jpg"])?.isInvalidated).toBe(
      false,
    );
  });
});
