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
            estimatedValue: 0,
            byCategory: [{ categoryId: "cat-1", name: "野菜", count: 3, value: 0 }],
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
            estimatedValue: 0,
            byCategory: [
              { categoryId: "cat-1", name: "野菜", count: 3, value: 0 },
              { categoryId: null, name: "__uncategorized__", count: 2, value: 0 },
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

  it("sr-onlyテーブルはrole=imgの外にあり、支援技術のツリーから隠されない (#922)", () => {
    const { container } = render(
      <WasteStatsChart
        data={[
          {
            month: "2026/03",
            total: 3,
            estimatedValue: 0,
            byCategory: [{ categoryId: "cat-1", name: "野菜", count: 3, value: 0 }],
          },
        ]}
      />,
      { wrapper },
    );
    const img = container.querySelector('[role="img"]');
    const table = container.querySelector("table.sr-only");
    expect(img?.contains(table)).toBe(false);
  });
});

describe("WasteStatsChart — 推定廃棄金額 (#1100)", () => {
  it("単価データがある場合、推定廃棄金額の合計が可視サマリとaria-label・テーブルに表示される", () => {
    const { container, getByText } = render(
      <WasteStatsChart
        data={[
          {
            month: "2026/03",
            total: 2,
            estimatedValue: 500,
            byCategory: [{ categoryId: "cat-1", name: "野菜", count: 2, value: 500 }],
          },
          {
            month: "2026/04",
            total: 1,
            estimatedValue: 300,
            byCategory: [{ categoryId: "cat-1", name: "野菜", count: 1, value: 300 }],
          },
        ]}
      />,
      { wrapper },
    );

    expect(getByText(`${i18n.t("stats:estimatedWasteValue")}: ¥800`)).toBeDefined();

    const img = container.querySelector('[role="img"]');
    expect(img?.getAttribute("aria-label")).toContain("¥500");
    expect(img?.getAttribute("aria-label")).toContain("¥300");

    const table = container.querySelector("table.sr-only");
    expect(table?.textContent).toContain("¥500");
    expect(table?.textContent).toContain("¥300");
  });

  it("単価データが無い場合、推定廃棄金額のサマリ・列は表示されない", () => {
    const { container, queryByText } = render(
      <WasteStatsChart
        data={[
          {
            month: "2026/03",
            total: 2,
            estimatedValue: 0,
            byCategory: [{ categoryId: "cat-1", name: "野菜", count: 2, value: 0 }],
          },
        ]}
      />,
      { wrapper },
    );

    expect(queryByText(/estimatedWasteValue|推定廃棄金額/)).toBeNull();
    const table = container.querySelector("table.sr-only");
    expect(table?.textContent).not.toContain("¥");
  });
});
