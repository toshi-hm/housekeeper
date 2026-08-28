import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { ConsumptionChart } from "./ConsumptionChart";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("ConsumptionChart — アクセシビリティ (#665)", () => {
  it("role=imgのaria-labelに月ごとの単位別消費量が含まれる", () => {
    const { container } = render(
      <ConsumptionChart
        data={[
          { month: "2026/03", totals: [{ unit: "mL", total: 500 }] },
          { month: "2026/04", totals: [{ unit: "mL", total: 300 }] },
        ]}
      />,
      { wrapper },
    );
    const img = container.querySelector('[role="img"]');
    expect(img?.getAttribute("aria-label")).toContain("2026/03");
    expect(img?.getAttribute("aria-label")).toContain("mL 500");
  });

  it("視覚的に隠したテーブルの列に単位ごとの値が入る", () => {
    const { container } = render(
      <ConsumptionChart
        data={[
          {
            month: "2026/03",
            totals: [
              { unit: "mL", total: 500 },
              { unit: "個", total: 2 },
            ],
          },
        ]}
      />,
      { wrapper },
    );
    const table = container.querySelector("table.sr-only");
    expect(table?.textContent).toContain("mL");
    expect(table?.textContent).toContain("500");
    expect(table?.textContent).toContain("2");
  });

  it("sr-onlyテーブルはrole=imgの外にあり、支援技術のツリーから隠されない (#922)", () => {
    const { container } = render(
      <ConsumptionChart data={[{ month: "2026/03", totals: [{ unit: "mL", total: 500 }] }]} />,
      { wrapper },
    );
    const img = container.querySelector('[role="img"]');
    const table = container.querySelector("table.sr-only");
    expect(img?.contains(table)).toBe(false);
  });
});
