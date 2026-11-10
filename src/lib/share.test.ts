import { afterEach, describe, expect, mock, test } from "bun:test";

import { canShare, shareText } from "./share";

describe("share", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "share");
  });

  test("navigator.share が無ければ canShare は false", () => {
    Reflect.deleteProperty(navigator, "share");
    expect(canShare()).toBe(false);
  });

  test("navigator.share があれば canShare は true", () => {
    Object.defineProperty(navigator, "share", { value: mock(), configurable: true });
    expect(canShare()).toBe(true);
  });

  test("shareText は title と text を渡して navigator.share を呼ぶ", async () => {
    const share = mock(() => Promise.resolve());
    Object.defineProperty(navigator, "share", { value: share, configurable: true });
    await shareText("買い物リスト", "牛乳");
    expect(share).toHaveBeenCalledWith({ title: "買い物リスト", text: "牛乳" });
  });
});
