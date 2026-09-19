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
      <ShoppingModeEstimatedTotal total={1234} excludedItemNames={[]} />,
      { wrapper },
    );
    expect(container.textContent).toContain("1,234");
  });

  it("does not show the partial note when every item is included", () => {
    const { container } = render(
      <ShoppingModeEstimatedTotal total={100} excludedItemNames={[]} />,
      { wrapper },
    );
    expect(container.querySelectorAll("p")).toHaveLength(2);
  });

  it("shows the excluded item count and names when some items are excluded", () => {
    const excludedItemNames = ["牛乳", "卵"];
    const { getByText } = render(
      <ShoppingModeEstimatedTotal total={100} excludedItemNames={excludedItemNames} />,
      { wrapper },
    );
    const names = new Intl.ListFormat(i18n.language, {
      style: "long",
      type: "conjunction",
    }).format(excludedItemNames);
    expect(
      getByText(
        i18n.t("shopping:shoppingModeEstimatedTotalPartialNote", {
          count: excludedItemNames.length,
          names,
        }),
      ),
    ).toBeTruthy();
  });
});
