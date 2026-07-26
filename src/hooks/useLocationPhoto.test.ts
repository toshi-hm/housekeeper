import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

const events: string[] = [];
const uploadMock = mock(() =>
  Promise.resolve({ data: { path: "user-1/location-1.jpg" }, error: null }),
);
const removeMock = mock((paths: string[]) => {
  events.push(`remove:${paths.join(",")}`);
  return Promise.resolve({ error: null });
});
const createSignedUrlMock = mock((path: string) =>
  Promise.resolve({ data: { signedUrl: `https://signed.example/${path}` }, error: null }),
);
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
        createSignedUrl: createSignedUrlMock,
        upload: uploadMock,
        remove: removeMock,
      }),
    },
    from: () => ({ update: updateMock }),
  },
}));

const { uploadLocationPhoto, useSignedLocationPhoto, deleteLocationPhoto } =
  await import("@/hooks/useLocationPhoto");

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
    Promise.resolve({ data: { path: "user-1/location-1.jpg" }, error: null }),
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

describe("useSignedLocationPhoto", () => {
  test("photo_pathからsigned URLを取得する", async () => {
    const { result } = renderHook(() => useSignedLocationPhoto("user-1/location-1.jpg"), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toBe("https://signed.example/user-1/location-1.jpg");
  });

  test("photo_pathがnullのときは問い合わせない", () => {
    createSignedUrlMock.mockClear();
    const { result } = renderHook(() => useSignedLocationPhoto(null), { wrapper: makeWrapper() });

    expect(createSignedUrlMock).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });
});

describe("uploadLocationPhoto", () => {
  test("DB更新成功後にだけ旧写真を削除する", async () => {
    const file = new File([new Uint8Array(100)], "photo.webp", { type: "image/webp" });
    const queryClient = makeQueryClient();

    const path = await uploadLocationPhoto({
      locationId: "location-1",
      file,
      oldPhotoPath: "user-1/location-1.jpg",
      queryClient,
    });

    expect(path).toBe("user-1/location-1.webp");
    expect(uploadMock).toHaveBeenCalledWith("user-1/location-1.webp", file, {
      upsert: true,
      contentType: "image/webp",
    });
    expect(updateMock).toHaveBeenCalledWith({ photo_path: "user-1/location-1.webp" });
    expect(updateEqMock).toHaveBeenCalledWith("id", "location-1");
    expect(events).toEqual(["update", "remove:user-1/location-1.jpg"]);
  });

  test("DB更新失敗時は新写真をrollbackし、旧写真を残す", async () => {
    updateEqMock.mockImplementationOnce(() => {
      events.push("update");
      return Promise.resolve({ error: { message: "db failed" } });
    });
    const file = new File([new Uint8Array(100)], "photo.webp", { type: "image/webp" });
    const queryClient = makeQueryClient();

    await expect(
      uploadLocationPhoto({
        locationId: "location-1",
        file,
        oldPhotoPath: "user-1/location-1.jpg",
        queryClient,
      }),
    ).rejects.toThrow("db failed");

    expect(events).toEqual(["update", "remove:user-1/location-1.webp"]);
    expect(removeMock).not.toHaveBeenCalledWith(["user-1/location-1.jpg"]);
  });
});

describe("deleteLocationPhoto", () => {
  test("photo_pathをnullにしてからStorageオブジェクトを削除する", async () => {
    const queryClient = makeQueryClient();

    await deleteLocationPhoto("location-1", "user-1/location-1.jpg", queryClient);

    expect(updateMock).toHaveBeenCalledWith({ photo_path: null });
    expect(updateEqMock).toHaveBeenCalledWith("id", "location-1");
    expect(events).toEqual(["update", "remove:user-1/location-1.jpg"]);
  });
});
