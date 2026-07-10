import { afterEach, describe, expect, mock, test } from "bun:test";

import { canShare, shareText } from "@/lib/share";

interface ShareNavigator extends Navigator {
  share?: (data: { title: string; text: string }) => Promise<void>;
}

const nav = navigator as ShareNavigator;
const originalShare = nav.share;

afterEach(() => {
  if (originalShare) nav.share = originalShare;
  else delete nav.share;
});

describe("share", () => {
  test("canShare: navigator.share の有無を判定する", () => {
    delete nav.share;
    expect(canShare()).toBe(false);

    nav.share = () => Promise.resolve();
    expect(canShare()).toBe(true);
  });

  test("shareText: title と text をそのまま navigator.share へ渡す", async () => {
    const shareMock = mock(() => Promise.resolve());
    nav.share = shareMock;

    await shareText("共有タイトル", "共有本文");

    expect(shareMock).toHaveBeenCalledWith({ title: "共有タイトル", text: "共有本文" });
  });
});
