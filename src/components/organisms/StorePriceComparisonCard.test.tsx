import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { StorePriceComparisonCard } from "./StorePriceComparisonCard";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("StorePriceComparisonCard (#697)", () => {
  it("比較対象が無い場合は何も描画しない", () => {
    const { container } = render(<StorePriceComparisonCard comparisons={[]} />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  it("店舗名と単価を安い順で表示し、最安に印を付ける", () => {
    const { getAllByRole, getByText } = render(
      <StorePriceComparisonCard
        comparisons={[
          {
            itemId: "item-1",
            itemName: "牛乳",
            stores: [
              { storeName: "○○スーパー", unitPrice: 198, purchaseDate: "2026-07-20" },
              { storeName: "△△マート", unitPrice: 228, purchaseDate: "2026-07-05" },
            ],
          },
        ]}
      />,
      { wrapper },
    );

    expect(getByText("牛乳")).toBeTruthy();
    const rows = getAllByRole("row");
    // 先頭行はヘッダー、2行目が最安の○○スーパー
    expect(rows[1]?.textContent).toContain("○○スーパー");
    expect(rows[1]?.textContent).toContain("198");
    expect(rows[1]?.textContent).toContain(i18n.t("stats:storePriceCheapest"));
    expect(rows[2]?.textContent).toContain("△△マート");
    expect(rows[2]?.textContent).not.toContain(i18n.t("stats:storePriceCheapest"));
  });

  it("複数アイテムを列挙する", () => {
    const { getByText } = render(
      <StorePriceComparisonCard
        comparisons={[
          {
            itemId: "item-1",
            itemName: "牛乳",
            stores: [
              { storeName: "A", unitPrice: 100, purchaseDate: null },
              { storeName: "B", unitPrice: 120, purchaseDate: null },
            ],
          },
          {
            itemId: "item-2",
            itemName: "卵",
            stores: [
              { storeName: "A", unitPrice: 200, purchaseDate: null },
              { storeName: "B", unitPrice: 250, purchaseDate: null },
            ],
          },
        ]}
      />,
      { wrapper },
    );

    expect(getByText("牛乳")).toBeTruthy();
    expect(getByText("卵")).toBeTruthy();
  });
});
