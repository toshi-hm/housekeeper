import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { WasteStatsChart } from "./WasteStatsChart";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("WasteStatsChart — アクセシビリティ (#665)", () => {
  it("role=imgのaria-labelに月ごとの合計廃棄件数が含まれる", () => {
    const { container } = render(
      <WasteStatsChart
        data={[
          {
            month: "2026/03",
            total: 3,
            byCategory: [{ categoryId: "cat-1", name: "野菜", count: 3 }],
          },
        ]}
      />,
      { wrapper },
    );
    const img = container.querySelector('[role="img"]');
    expect(img?.getAttribute("aria-label")).toContain("2026/03");
    expect(img?.getAttribute("aria-label")).toContain("3");
  });

  it("視覚的に隠したテーブルの列にカテゴリ別の件数が入る", () => {
    const { container } = render(
      <WasteStatsChart
        data={[
          {
            month: "2026/03",
            total: 5,
            byCategory: [
              { categoryId: "cat-1", name: "野菜", count: 3 },
              { categoryId: null, name: "__uncategorized__", count: 2 },
            ],
          },
        ]}
      />,
      { wrapper },
    );
    const table = container.querySelector("table.sr-only");
    expect(table?.textContent).toContain("野菜");
    expect(table?.textContent).toContain(i18n.t("stats:uncategorized"));
  });
});
