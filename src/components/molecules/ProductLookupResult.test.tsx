import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { ProductLookupResult } from "./ProductLookupResult";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("ProductLookupResult (#655)", () => {
  it("errorType未指定(商品なし)の場合はproductNotFoundを表示する", () => {
    const { getByText } = render(<ProductLookupResult isLoading={false} product={null} />, {
      wrapper,
    });
    expect(getByText(i18n.t("items:productNotFound"))).toBeTruthy();
  });

  it("errorType=networkの場合はoffline用メッセージを表示する", () => {
    const { getByText } = render(
      <ProductLookupResult isLoading={false} product={null} errorType="network" />,
      { wrapper },
    );
    expect(getByText(i18n.t("common:offlineError"))).toBeTruthy();
  });

  it("errorType=server_errorの場合は専用のサーバーエラーメッセージを表示する（#655）", () => {
    const { getByText } = render(
      <ProductLookupResult isLoading={false} product={null} errorType="server_error" />,
      { wrapper },
    );
    expect(getByText(i18n.t("items:productLookupServerError"))).toBeTruthy();
  });

  it("errorType=timeoutの場合は専用のタイムアウトメッセージを表示する（#709）", () => {
    const { getByText } = render(
      <ProductLookupResult isLoading={false} product={null} errorType="timeout" />,
      { wrapper },
    );
    expect(getByText(i18n.t("items:productLookupTimeout"))).toBeTruthy();
  });

  it("errorType=rate_limitedの場合は専用のレート制限メッセージを表示する（#803）", () => {
    const { getByText } = render(
      <ProductLookupResult isLoading={false} product={null} errorType="rate_limited" />,
      { wrapper },
    );
    expect(getByText(i18n.t("items:productLookupRateLimited"))).toBeTruthy();
  });

  it("ローディング中はスピナー用テキストを表示する", () => {
    const { getByText } = render(<ProductLookupResult isLoading product={undefined} />, {
      wrapper,
    });
    expect(getByText(i18n.t("items:productSearching"))).toBeTruthy();
  });
});
