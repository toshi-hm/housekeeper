import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { SpendingChart } from "./SpendingChart";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("SpendingChart — アクセシビリティ (#665)", () => {
  it("role=imgのaria-labelに各月の金額が含まれる", () => {
    const { container } = render(
      <SpendingChart
        data={[
          { month: "2025/11", total: 12000 },
          { month: "2025/12", total: 8500 },
        ]}
      />,
      { wrapper },
    );
    const img = container.querySelector('[role="img"]');
    expect(img).not.toBeNull();
    expect(img?.getAttribute("aria-label")).toContain("2025/11");
    expect(img?.getAttribute("aria-label")).toContain("¥12,000");
    expect(img?.getAttribute("aria-label")).toContain("¥8,500");
  });

  it("視覚的に隠したテーブルに同じデータが含まれる", () => {
    const { container } = render(<SpendingChart data={[{ month: "2026/01", total: 15200 }]} />, {
      wrapper,
    });
    const table = container.querySelector("table.sr-only");
    expect(table).not.toBeNull();
    expect(table?.textContent).toContain("2026/01");
    expect(table?.textContent).toContain("¥15,200");
  });

  it("データが無い場合はグラフを描画せずヒントのみ表示する", () => {
    const { container } = render(<SpendingChart data={[{ month: "2026/01", total: 0 }]} />, {
      wrapper,
    });
    expect(container.querySelector('[role="img"]')).toBeNull();
  });
});
