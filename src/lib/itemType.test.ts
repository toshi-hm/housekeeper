import { describe, expect, test } from "bun:test";

import {
  ITEM_TYPE_TABS,
  itemTypeTabId,
  itemTypeTabLabelKey,
  itemTypeTabPanelId,
  parseItemTypeTab,
} from "./itemType";

describe("parseItemTypeTab", () => {
  test("有効なタブ値はそのまま返す", () => {
    expect(parseItemTypeTab("all")).toBe("all");
    expect(parseItemTypeTab("food")).toBe("food");
    expect(parseItemTypeTab("daily_goods")).toBe("daily_goods");
  });

  test("未指定・不正値は all に丸める（URLを手で書き換えられても壊れない）", () => {
    expect(parseItemTypeTab(undefined)).toBe("all");
    expect(parseItemTypeTab("")).toBe("all");
    expect(parseItemTypeTab("drinks")).toBe("all");
  });
});

describe("itemTypeTab の id ヘルパー", () => {
  test("タブとパネルのidが対応し、タブごとに一意になる", () => {
    const ids = ITEM_TYPE_TABS.map(itemTypeTabId);
    expect(new Set(ids).size).toBe(ITEM_TYPE_TABS.length);
    for (const tab of ITEM_TYPE_TABS) {
      expect(itemTypeTabPanelId(tab)).toBe(`${itemTypeTabId(tab)}-panel`);
    }
  });

  test("すべてのタブにラベルキーがある", () => {
    for (const tab of ITEM_TYPE_TABS) {
      expect(itemTypeTabLabelKey[tab]).toBeTruthy();
    }
  });
});
