import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

const getSignedUrlMock = mock(() =>
  Promise.resolve({ data: { signedUrl: "https://signed.example/fetched.jpg" }, error: null }),
);

mock.module("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({
        createSignedUrl: getSignedUrlMock,
      }),
    },
  },
}));

const { ItemImage } = await import("@/components/atoms/ItemImage");

const wrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: queryClient }, children);
};

describe("ItemImage", () => {
  test("signedUrlが渡された場合はそれを使い、自前のcreateSignedUrl呼び出しをスキップする (#503)", () => {
    getSignedUrlMock.mockClear();
    const { container } = render(
      <ItemImage imagePath="a/1.jpg" signedUrl="https://signed.example/preresolved.jpg" />,
      { wrapper },
    );

    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://signed.example/preresolved.jpg");
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  test("signedUrlが未指定の場合は従来どおり自前でcreateSignedUrlを呼ぶ", () => {
    getSignedUrlMock.mockClear();
    render(<ItemImage imagePath="a/1.jpg" />, { wrapper });

    expect(getSignedUrlMock).toHaveBeenCalledTimes(1);
  });

  test("imagePathがない場合はフォールバックアイコンを表示する", () => {
    const { container } = render(<ItemImage imagePath={null} />, { wrapper });
    expect(container.querySelector("img")).toBeNull();
  });

  test("画像の読み込みに失敗したらフォールバックアイコンに切り替える (#456)", () => {
    const { container } = render(
      <ItemImage imagePath="a/1.jpg" signedUrl="https://signed.example/broken.jpg" />,
      { wrapper },
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();

    fireEvent.error(img!);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
