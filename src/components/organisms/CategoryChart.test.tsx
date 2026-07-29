import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { CategoryChart } from "./CategoryChart";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("CategoryChart — アクセシビリティ (#665)", () => {
  it("role=imgのaria-labelに各カテゴリの件数が含まれる", () => {
    const { container } = render(
      <CategoryChart
        stats={[
          { categoryId: "cat-1", name: "飲料", count: 5 },
          { categoryId: "cat-2", name: "調味料", count: 3 },
        ]}
      />,
      { wrapper },
    );
    const img = container.querySelector('[role="img"]');
    expect(img?.getAttribute("aria-label")).toContain("飲料");
    expect(img?.getAttribute("aria-label")).toContain("調味料");
  });

  it("視覚的に隠したテーブルに未分類の表示名が反映される", () => {
    const { container } = render(
      <CategoryChart stats={[{ categoryId: null, name: "__uncategorized__", count: 2 }]} />,
      { wrapper },
    );
    const table = container.querySelector("table.sr-only");
    expect(table?.textContent).toContain(i18n.t("stats:uncategorized"));
    expect(table?.textContent).toContain("2");
  });
});
