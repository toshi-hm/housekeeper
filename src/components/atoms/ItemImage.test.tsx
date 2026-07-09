import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";

import { createSupabaseMock } from "@/test/supabaseMock";
import { createHookWrapper } from "@/test/testUtils";

const sb = createSupabaseMock();
mock.module("@/lib/supabase", () => ({ supabase: sb.supabase }));

const { ItemImage } = await import("@/components/atoms/ItemImage");

beforeEach(() => {
  sb.reset();
});

describe("ItemImage", () => {
  test("imagePath がなければプレースホルダーを表示する", () => {
    const { wrapper: Wrapper } = createHookWrapper();
    const { container } = render(
      <Wrapper>
        <ItemImage imagePath={null} />
      </Wrapper>,
    );

    expect(container.querySelector("svg.lucide-package")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  test("署名 URL 取得後に画像を表示する", async () => {
    sb.setSignedUrlResponse({
      data: { signedUrl: "https://signed.example/item.jpg" },
      error: null,
    });

    const { wrapper: Wrapper } = createHookWrapper();
    const { container } = render(
      <Wrapper>
        <ItemImage imagePath="user-1/item.jpg" alt="テスト画像" />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(container.querySelector("img")?.getAttribute("src")).toBe(
        "https://signed.example/item.jpg",
      ),
    );
    expect(container.querySelector("img")?.getAttribute("alt")).toBe("テスト画像");
  });

  test("画像読み込みエラーで非表示にする", async () => {
    sb.setSignedUrlResponse({
      data: { signedUrl: "https://signed.example/broken.jpg" },
      error: null,
    });

    const { wrapper: Wrapper } = createHookWrapper();
    const { container } = render(
      <Wrapper>
        <ItemImage imagePath="user-1/broken.jpg" />
      </Wrapper>,
    );

    await waitFor(() => expect(container.querySelector("img")).not.toBeNull());

    const img = container.querySelector("img") as HTMLImageElement;
    fireEvent.error(img);
    expect(img.style.display).toBe("none");
  });
});
