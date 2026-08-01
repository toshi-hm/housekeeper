import { fireEvent, render } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { ExpiryTypeSelect } from "./ExpiryTypeSelect";

describe("ExpiryTypeSelect", () => {
  test("marks the current value and reports a best_before selection", () => {
    const onChange = mock(() => {});
    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <ExpiryTypeSelect value={null} onChange={onChange} />
      </I18nextProvider>,
    );

    expect(
      getByRole("button", { name: i18n.t("items:expiryTypeUnset") }).getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(getByRole("button", { name: i18n.t("items:expiryTypeBestBefore") }));
    expect(onChange).toHaveBeenCalledWith("best_before");
  });

  test("marks use_by as pressed when selected", () => {
    const onChange = mock(() => {});
    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <ExpiryTypeSelect value="use_by" onChange={onChange} />
      </I18nextProvider>,
    );

    expect(
      getByRole("button", { name: i18n.t("items:expiryTypeUseBy") }).getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(getByRole("button", { name: i18n.t("items:expiryTypeUnset") }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
