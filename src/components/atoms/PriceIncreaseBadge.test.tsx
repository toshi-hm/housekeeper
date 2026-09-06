import { render } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { PriceIncreaseBadge } from "./PriceIncreaseBadge";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("PriceIncreaseBadge (#941)", () => {
  test("renders nothing when there is no alert", () => {
    const { container } = render(<PriceIncreaseBadge alert={null} />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  test("renders nothing when alert is undefined", () => {
    const { container } = render(<PriceIncreaseBadge alert={undefined} />, { wrapper });
    expect(container.firstChild).toBeNull();
  });

  test("renders a badge with the increase percentage when there is an alert", () => {
    const { getByText } = render(
      <PriceIncreaseBadge alert={{ baselinePrice: 200, currentPrice: 250, increasePercent: 25 }} />,
      { wrapper },
    );
    expect(getByText(/25/)).toBeTruthy();
  });

  test("exposes the detail via a native title tooltip (mentions baseline/current price)", () => {
    const { getByText } = render(
      <PriceIncreaseBadge alert={{ baselinePrice: 200, currentPrice: 250, increasePercent: 25 }} />,
      { wrapper },
    );
    const badge = getByText(/25/);
    const title = badge.getAttribute("title");
    expect(title).toBeTruthy();
    expect(title).toContain("200");
    expect(title).toContain("250");
  });
});
