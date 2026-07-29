import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { CategoryValueChart } from "./CategoryValueChart";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("CategoryValueChart — アクセシビリティ (#665)", () => {
  it("role=imgのaria-labelに各カテゴリの金額が含まれる", () => {
    const { container } = render(
      <CategoryValueChart
        stats={[
          { categoryId: "cat-1", name: "飲料", value: 3200 },
          { categoryId: "cat-2", name: "調味料", value: 1800 },
        ]}
      />,
      { wrapper },
    );
    const img = container.querySelector('[role="img"]');
    expect(img?.getAttribute("aria-label")).toContain("飲料");
    expect(img?.getAttribute("aria-label")).toContain("¥3,200");
  });

  it("視覚的に隠したテーブルに金額が含まれる", () => {
    const { container } = render(
      <CategoryValueChart stats={[{ categoryId: "cat-1", name: "飲料", value: 3200 }]} />,
      { wrapper },
    );
    const table = container.querySelector("table.sr-only");
    expect(table?.textContent).toContain("¥3,200");
  });
});
