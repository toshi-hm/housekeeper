import { fireEvent, render } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import { itemTypeTabId, itemTypeTabPanelId } from "@/lib/itemType";

import { ItemTypeTabs } from "./ItemTypeTabs";

const counts = { all: 5, food: 3, daily_goods: 2 };

const renderTabs = (props: Partial<Parameters<typeof ItemTypeTabs>[0]> = {}) =>
  render(
    <I18nextProvider i18n={i18n}>
      <ItemTypeTabs value="all" counts={counts} onChange={() => {}} {...props} />
    </I18nextProvider>,
  );

describe("ItemTypeTabs", () => {
  test("3つのタブを件数付きで表示し、選択中のタブだけ aria-selected になる", () => {
    const { getAllByRole } = renderTabs({ value: "food" });
    const tabs = getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs.map((tab) => tab.getAttribute("aria-selected"))).toEqual([
      "false",
      "true",
      "false",
    ]);
    expect(tabs[1]?.textContent).toContain("(3)");
    expect(tabs[2]?.textContent).toContain("(2)");
  });

  test("タブをクリックすると onChange に対応する値が渡る", () => {
    const onChange = mock(() => {});
    const { getAllByRole } = renderTabs({ onChange });
    fireEvent.click(getAllByRole("tab")[2]!);
    expect(onChange).toHaveBeenCalledWith("daily_goods");
  });

  test("各タブが自分のパネルidを aria-controls で指す（accessibility.md §5）", () => {
    const { getAllByRole } = renderTabs();
    const tabs = getAllByRole("tab");
    expect(tabs[0]?.id).toBe(itemTypeTabId("all"));
    expect(tabs[0]?.getAttribute("aria-controls")).toBe(itemTypeTabPanelId("all"));
  });

  test("roving tabindex: 選択中のタブだけ tabIndex=0（accessibility.md §5）", () => {
    const { getAllByRole } = renderTabs({ value: "daily_goods" });
    expect(getAllByRole("tab").map((tab) => tab.getAttribute("tabindex"))).toEqual([
      "-1",
      "-1",
      "0",
    ]);
  });

  test("矢印キーで隣のタブへ移動する（accessibility.md §5）", () => {
    const onChange = mock(() => {});
    const { getAllByRole } = renderTabs({ value: "all", onChange });
    fireEvent.keyDown(getAllByRole("tab")[0]!, { key: "ArrowRight" });
    expect(onChange).toHaveBeenCalledWith("food");
  });

  test("タブが44px以上のタップ領域を持つ（#906）", () => {
    const { getAllByRole } = renderTabs();
    for (const tab of getAllByRole("tab")) {
      expect(tab.className).toContain("min-h-11");
    }
  });
});
