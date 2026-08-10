import { fireEvent, render } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { ViewModeToggle } from "./ViewModeToggle";

describe("ViewModeToggle", () => {
  test("marks the current mode and reports a list-mode selection", () => {
    const onChange = mock(() => {});
    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <ViewModeToggle value="grid" onChange={onChange} />
      </I18nextProvider>,
    );

    expect(
      getByRole("button", { name: i18n.t("items:viewModeGrid") }).getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(getByRole("button", { name: i18n.t("items:viewModeList") }));
    expect(onChange).toHaveBeenCalledWith("list");
  });

  test("ボタンが40px（h-10 w-10）のタップターゲットを持つ（#806）", () => {
    const { getByRole } = render(
      <I18nextProvider i18n={i18n}>
        <ViewModeToggle value="grid" onChange={() => {}} />
      </I18nextProvider>,
    );
    const button = getByRole("button", { name: i18n.t("items:viewModeGrid") });
    expect(button.className).toContain("h-10");
    expect(button.className).toContain("w-10");
  });
});
