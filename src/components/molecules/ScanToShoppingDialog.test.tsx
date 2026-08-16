import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { ScanToShoppingDialog } from "./ScanToShoppingDialog";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("ScanToShoppingDialog (#851)", () => {
  it("errorType未指定で在庫一致した場合はscanMatchedExistingを表示する", () => {
    const { getByText, queryByText } = render(
      <ScanToShoppingDialog
        open
        isLooking={false}
        defaultName="牛乳"
        matchedExisting
        onConfirm={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    );
    expect(getByText(i18n.t("shopping:scanMatchedExisting"))).toBeTruthy();
    expect(queryByText(i18n.t("items:productLookupRateLimited"))).toBeNull();
  });

  it("errorType未指定で在庫未一致の場合はscanNewProductを表示する", () => {
    const { getByText } = render(
      <ScanToShoppingDialog
        open
        isLooking={false}
        defaultName="オーガニックグリーンティー"
        matchedExisting={false}
        onConfirm={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    );
    expect(getByText(i18n.t("shopping:scanNewProduct"))).toBeTruthy();
  });

  it("errorType=rate_limitedの場合はレート制限メッセージを表示し、scanNewProductは表示しない（#851）", () => {
    const { getByText, queryByText } = render(
      <ScanToShoppingDialog
        open
        isLooking={false}
        defaultName=""
        matchedExisting={false}
        errorType="rate_limited"
        onConfirm={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    );
    expect(getByText(i18n.t("items:productLookupRateLimited"))).toBeTruthy();
    expect(queryByText(i18n.t("shopping:scanNewProduct"))).toBeNull();
  });

  it("errorType=networkの場合はオフライン用メッセージを表示する（#851）", () => {
    const { getByText } = render(
      <ScanToShoppingDialog
        open
        isLooking={false}
        defaultName=""
        matchedExisting={false}
        errorType="network"
        onConfirm={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    );
    expect(getByText(i18n.t("common:offlineError"))).toBeTruthy();
  });

  it("isLooking中はerrorTypeが指定されていてもスピナーを優先表示する", () => {
    const { getByText, queryByText } = render(
      <ScanToShoppingDialog
        open
        isLooking
        defaultName=""
        matchedExisting={false}
        errorType="server_error"
        onConfirm={() => {}}
        onClose={() => {}}
      />,
      { wrapper },
    );
    expect(getByText(i18n.t("shopping:scanLookingUp"))).toBeTruthy();
    expect(queryByText(i18n.t("items:productLookupServerError"))).toBeNull();
  });
});
