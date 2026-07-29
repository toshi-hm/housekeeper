import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { ExpiryChart } from "./ExpiryChart";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("ExpiryChart — アクセシビリティ (#665)", () => {
  it("role=imgのaria-labelに各ステータスの件数が含まれる", () => {
    const { container } = render(
      <ExpiryChart
        distribution={[
          { status: "expired", count: 2 },
          { status: "ok", count: 10 },
        ]}
      />,
      { wrapper },
    );
    const img = container.querySelector('[role="img"]');
    expect(img?.getAttribute("aria-label")).toContain(i18n.t("items:expiryStatus.expired"));
    expect(img?.getAttribute("aria-label")).toContain(i18n.t("items:expiryStatus.ok"));
  });

  it("視覚的に隠したテーブルに件数が含まれる", () => {
    const { container } = render(
      <ExpiryChart distribution={[{ status: "expiring-soon", count: 4 }]} />,
      { wrapper },
    );
    const table = container.querySelector("table.sr-only");
    expect(table?.textContent).toContain(i18n.t("items:expiryStatus.expiring-soon"));
    expect(table?.textContent).toContain("4");
  });
});
