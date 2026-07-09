import { render } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { ProductLookupResult } from "@/components/molecules/ProductLookupResult";
import i18n from "@/lib/i18n";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("ProductLookupResult", () => {
  test("ローディング中は検索中メッセージを表示する", () => {
    const { getByText } = render(<ProductLookupResult isLoading={true} product={undefined} />, {
      wrapper,
    });
    expect(getByText(i18n.t("items:productSearching"))).toBeTruthy();
  });

  test("product が undefined なら何も表示しない", () => {
    const { container } = render(<ProductLookupResult isLoading={false} product={undefined} />, {
      wrapper,
    });
    expect(container.firstChild).toBeNull();
  });

  test("product が null (not_found) なら見つからないメッセージ", () => {
    const { getByText } = render(
      <ProductLookupResult isLoading={false} product={null} errorType="not_found" />,
      { wrapper },
    );
    expect(getByText(i18n.t("items:productNotFound"))).toBeTruthy();
  });

  test("product が null (network) ならオフラインエラーメッセージ", () => {
    const { getByText } = render(
      <ProductLookupResult isLoading={false} product={null} errorType="network" />,
      { wrapper },
    );
    expect(getByText(i18n.t("common:offlineError"))).toBeTruthy();
  });

  test("商品情報 (画像・ブランド・説明) を表示する", () => {
    const { getByText, container } = render(
      <ProductLookupResult
        isLoading={false}
        product={{
          name: "緑茶",
          image_url: "https://img.example/tea.jpg",
          brand: "お茶ブランド",
          description: "おいしいお茶です",
        }}
      />,
      { wrapper },
    );

    expect(getByText("緑茶")).toBeTruthy();
    expect(getByText(/お茶ブランド/)).toBeTruthy();
    expect(getByText("おいしいお茶です")).toBeTruthy();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://img.example/tea.jpg");
  });

  test("画像・ブランド・説明がない商品は名前のみ表示する", () => {
    const { getByText, container } = render(
      <ProductLookupResult isLoading={false} product={{ name: "シンプル商品" }} />,
      { wrapper },
    );

    expect(getByText("シンプル商品")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });
});
