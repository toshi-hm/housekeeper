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
const uploadMock = mock(() => Promise.resolve({ error: null }));
const removeMock = mock((paths: string[]) => {
  events.push(`remove:${paths.join(",")}`);
  return Promise.resolve({ error: null });
});
const updateEqMock = mock(() => {
  events.push("update");
  return Promise.resolve({ error: null });
});
const updateMock = mock(() => ({ eq: updateEqMock }));

mock.module("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }),
    },
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

const makeWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

afterEach(() => {
  events.length = 0;
  uploadMock.mockReset();
  uploadMock.mockImplementation(() => Promise.resolve({ error: null }));
  removeMock.mockClear();
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

    const path = await uploadItemImage({
      itemId: "item-1",
      file,
      oldImagePath: "user-1/item-1.jpg",
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

    await expect(
      uploadItemImage({
        itemId: "item-1",
        file,
        oldImagePath: "user-1/item-1.jpg",
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

    await expect(
      uploadItemImage({
        itemId: "item-1",
        file,
        oldImagePath: "user-1/item-1.webp",
      }),
    ).rejects.toThrow("db failed");

    expect(events).toEqual(["update"]);
    expect(removeMock).not.toHaveBeenCalled();
  });
});
