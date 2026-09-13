import "fake-indexeddb/auto";

import { describe, expect, test } from "bun:test";

import {
  discardPendingPurchaseImage,
  storePendingPurchaseImage,
  takePendingPurchaseImage,
} from "@/lib/offlinePendingPurchaseImage";

describe("offlinePendingPurchaseImage", () => {
  test("保存した画像を取り出すと、元のFileと同じ内容・ファイル名・MIMEタイプが復元される", async () => {
    const actionId = crypto.randomUUID();
    const file = new File(["hello world"], "photo.jpg", { type: "image/jpeg" });

    await storePendingPurchaseImage(actionId, file);
    const restored = await takePendingPurchaseImage(actionId);

    expect(restored).toBeInstanceOf(File);
    expect(restored?.name).toBe("photo.jpg");
    expect(restored?.type).toBe("image/jpeg");
    expect(await restored?.text()).toBe("hello world");
  });

  test("取り出すと保存分は削除され、2回目の取り出しはnullを返す", async () => {
    const actionId = crypto.randomUUID();
    await storePendingPurchaseImage(actionId, new File(["x"], "a.png", { type: "image/png" }));

    expect(await takePendingPurchaseImage(actionId)).not.toBeNull();
    expect(await takePendingPurchaseImage(actionId)).toBeNull();
  });

  test("保存されていないactionIdを取り出すとnullを返す", async () => {
    expect(await takePendingPurchaseImage(crypto.randomUUID())).toBeNull();
  });

  test("discardPendingPurchaseImageで保存分を削除でき、以後の取り出しはnullを返す", async () => {
    const actionId = crypto.randomUUID();
    await storePendingPurchaseImage(actionId, new File(["x"], "a.png", { type: "image/png" }));

    await discardPendingPurchaseImage(actionId);

    expect(await takePendingPurchaseImage(actionId)).toBeNull();
  });

  test("保存していないactionIdをdiscardしてもエラーにならない", async () => {
    await expect(discardPendingPurchaseImage(crypto.randomUUID())).resolves.toBeUndefined();
  });

  test("複数のactionIdの画像は互いに独立して保存・取り出しできる", async () => {
    const idA = crypto.randomUUID();
    const idB = crypto.randomUUID();
    await storePendingPurchaseImage(idA, new File(["a"], "a.png", { type: "image/png" }));
    await storePendingPurchaseImage(idB, new File(["b"], "b.png", { type: "image/png" }));

    const restoredB = await takePendingPurchaseImage(idB);
    expect(restoredB?.name).toBe("b.png");
    // idA はまだ取り出していないので残っている
    const restoredA = await takePendingPurchaseImage(idA);
    expect(restoredA?.name).toBe("a.png");
  });
});
