import { fireEvent, render } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

import { ItemTypeSelect } from "./ItemTypeSelect";

const renderSelect = (props: Parameters<typeof ItemTypeSelect>[0]) =>
  render(
    <I18nextProvider i18n={i18n}>
      <ItemTypeSelect {...props} />
    </I18nextProvider>,
  );

describe("ItemTypeSelect", () => {
  test("現在の値を aria-pressed で示し、もう一方を選ぶと onChange が呼ばれる", () => {
    const onChange = mock(() => {});
    const { getByRole } = renderSelect({ value: "food", onChange });

    expect(
      getByRole("button", { name: i18n.t("items:itemTypeFood") }).getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(getByRole("button", { name: i18n.t("items:itemTypeDailyGoods") }));
    expect(onChange).toHaveBeenCalledWith("daily_goods");
  });

  test("daily_goods を選択中は日用品側が押下状態になる", () => {
    const { getByRole } = renderSelect({ value: "daily_goods", onChange: () => {} });
    expect(
      getByRole("button", { name: i18n.t("items:itemTypeDailyGoods") }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");
  });

  test("ボタンが最小40px（min-h-10）のタップターゲットを持つ（#806）", () => {
    const { getByRole } = renderSelect({ value: "food", onChange: () => {} });
    expect(getByRole("button", { name: i18n.t("items:itemTypeFood") }).className).toContain(
      "min-h-10",
    );
  });
});
