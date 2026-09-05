import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { ShoppingModeEstimatedTotal } from "./ShoppingModeEstimatedTotal";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

describe("ShoppingModeEstimatedTotal", () => {
  it("renders the formatted total amount", () => {
    const { container } = render(
      <ShoppingModeEstimatedTotal total={1234} hasExcludedItems={false} />,
      { wrapper },
    );
    expect(container.textContent).toContain("1,234");
  });

  it("does not show the partial note when every item is included", () => {
    const { queryByText } = render(
      <ShoppingModeEstimatedTotal total={100} hasExcludedItems={false} />,
      { wrapper },
    );
    expect(queryByText(i18n.t("shopping:shoppingModeEstimatedTotalPartialNote"))).toBeNull();
  });

  it("shows the partial note when some items are excluded", () => {
    const { getByText } = render(<ShoppingModeEstimatedTotal total={100} hasExcludedItems />, {
      wrapper,
    });
    expect(getByText(i18n.t("shopping:shoppingModeEstimatedTotalPartialNote"))).toBeTruthy();
  });
});
