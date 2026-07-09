import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { createSupabaseMock, setNavigatorOnline } from "@/test/supabaseMock";
import { createHookWrapper } from "@/test/testUtils";

const sb = createSupabaseMock();
mock.module("@/lib/supabase", () => ({ supabase: sb.supabase }));

const { downloadExternalImageAsFile, removeItemImageFile, uploadItemImage, useSignedItemImage } =
  await import("@/hooks/useItemImage");

beforeEach(() => {
  sb.reset();
});

afterEach(() => {
  setNavigatorOnline(true);
});

describe("removeItemImageFile", () => {
  test("ストレージからファイルを削除する", async () => {
    await removeItemImageFile("user-1/item-1.jpg");

    expect(sb.storageCalls[0]).toMatchObject({
      bucket: "item-images",
      method: "remove",
      args: [["user-1/item-1.jpg"]],
    });
  });

  test("オフラインなら OfflineError を投げる", async () => {
    setNavigatorOnline(false);
    await expect(removeItemImageFile("path")).rejects.toThrow("You are offline");
  });
});

describe("downloadExternalImageAsFile", () => {
  test("image-proxy 経由で File を生成する", async () => {
    const base64 = btoa("fake-image-bytes");
    sb.setInvokeResponse({ data: { data: base64, contentType: "image/png" }, error: null });

    const file = await downloadExternalImageAsFile("https://img.example/a.png");

    expect(file.name).toBe("product.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBe("fake-image-bytes".length);
    expect(sb.invokeCalls[0]?.name).toBe("image-proxy");
  });

  test("contentType にパラメータが付いていても拡張子を取り出す", async () => {
    sb.setInvokeResponse({
      data: { data: btoa("x"), contentType: "image/jpeg; charset=binary" },
      error: null,
    });

    const file = await downloadExternalImageAsFile("https://img.example/b.jpg");
    expect(file.name).toBe("product.jpeg");
  });

  test("エラー応答なら throw する", async () => {
    sb.setInvokeResponse({ data: null, error: { message: "proxy failed" } });

    await expect(downloadExternalImageAsFile("https://img.example/c.png")).rejects.toThrow(
      "proxy failed",
    );
  });
});

describe("useSignedItemImage", () => {
  test("署名 URL を取得する", async () => {
    sb.setSignedUrlResponse({ data: { signedUrl: "https://signed.example/ok" }, error: null });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useSignedItemImage("user-1/item.jpg"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe("https://signed.example/ok");
  });

  test("取得失敗で isError になる", async () => {
    sb.setSignedUrlResponse({ data: null, error: { message: "sign failed" } });

    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useSignedItemImage("user-1/item.jpg"), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  test("imagePath が空ならクエリを実行しない", () => {
    const { wrapper } = createHookWrapper();
    const { result } = renderHook(() => useSignedItemImage(null), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("uploadItemImage", () => {
  const makeFile = (name: string, type = "image/jpeg") => new File(["binary"], name, { type });

  test("アップロードして items.image_path を更新する", async () => {
    sb.enqueue("items", { error: null });

    const path = await uploadItemImage({ itemId: "item-1", file: makeFile("photo.JPG") });

    expect(path).toBe("user-1/item-1.jpg");
    expect(sb.storageCalls[0]?.method).toBe("upload");

    const [itemsQuery] = sb.queriesFor("items");
    expect(itemsQuery?.ops[0]?.method).toBe("update");
    expect(itemsQuery?.ops[0]?.args[0]).toEqual({ image_path: "user-1/item-1.jpg" });
  });

  test("拡張子がない/長すぎる場合は jpg にフォールバックする", async () => {
    sb.enqueue("items", { error: null }, { error: null });

    const path1 = await uploadItemImage({ itemId: "item-1", file: makeFile("noext") });
    expect(path1).toBe("user-1/item-1.jpg");

    const path2 = await uploadItemImage({ itemId: "item-2", file: makeFile("a.superlongext") });
    expect(path2).toBe("user-1/item-2.jpg");
  });

  test("旧画像パスが異なる場合は削除する", async () => {
    sb.enqueue("items", { error: null });

    await uploadItemImage({
      itemId: "item-1",
      file: makeFile("photo.png"),
      oldImagePath: "user-1/item-1.jpg",
    });

    const removeCall = sb.storageCalls.find((call) => call.method === "remove");
    expect(removeCall?.args[0]).toEqual(["user-1/item-1.jpg"]);
  });

  test("旧画像パスが同じなら削除しない", async () => {
    sb.enqueue("items", { error: null });

    await uploadItemImage({
      itemId: "item-1",
      file: makeFile("photo.jpg"),
      oldImagePath: "user-1/item-1.jpg",
    });

    expect(sb.storageCalls.some((call) => call.method === "remove")).toBe(false);
  });

  test("未認証ならエラーになる", async () => {
    sb.setUser(null);

    await expect(
      uploadItemImage({ itemId: "item-1", file: makeFile("photo.jpg") }),
    ).rejects.toThrow("Not authenticated");
  });

  test("アップロード失敗は throw する", async () => {
    sb.setUploadResponse({ error: { message: "upload failed" } });

    await expect(
      uploadItemImage({ itemId: "item-1", file: makeFile("photo.jpg") }),
    ).rejects.toThrow("upload failed");
  });

  test("items 更新失敗は throw する", async () => {
    sb.enqueue("items", { error: { message: "update failed" } });

    await expect(
      uploadItemImage({ itemId: "item-1", file: makeFile("photo.jpg") }),
    ).rejects.toThrow("update failed");
  });

  test("オフラインなら OfflineError を投げる", async () => {
    setNavigatorOnline(false);

    await expect(
      uploadItemImage({ itemId: "item-1", file: makeFile("photo.jpg") }),
    ).rejects.toThrow("You are offline");
  });
});
