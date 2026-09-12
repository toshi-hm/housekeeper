import { describe, expect, test } from "bun:test";

import type { ShoppingItem } from "@/types/shopping";

import { findDuplicatePlannedItem } from "./shoppingDuplicates";

const makeRow = (overrides: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id: "row-1",
  user_id: "user-1",
  name: "牛乳",
  desired_units: 1,
  note: null,
  linked_item_id: null,
  auto_added: false,
  status: "planned",
  purchased_at: null,
  created_item_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("findDuplicatePlannedItem", () => {
  test("完全一致する名前の行を重複として検出する", () => {
    const rows = [makeRow({ id: "a", name: "牛乳" })];

    expect(findDuplicatePlannedItem(rows, { name: "牛乳" })?.id).toBe("a");
  });

  test("大文字小文字・前後空白の表記揺れを無視して重複判定する (#522, #447)", () => {
    const rows = [makeRow({ id: "a", name: "Milk" })];

    expect(findDuplicatePlannedItem(rows, { name: "  milk  " })?.id).toBe("a");
  });

  test("linked_item_id が一致すれば名前が異なっていても重複と判定する", () => {
    const rows = [makeRow({ id: "a", name: "低脂肪牛乳", linked_item_id: "item-1" })];

    expect(findDuplicatePlannedItem(rows, { name: "牛乳", linked_item_id: "item-1" })?.id).toBe(
      "a",
    );
  });

  test("linked_item_id が異なり、名前も一致しなければ重複なし", () => {
    const rows = [makeRow({ id: "a", name: "牛乳", linked_item_id: "item-1" })];

    expect(
      findDuplicatePlannedItem(rows, { name: "パン", linked_item_id: "item-2" }),
    ).toBeUndefined();
  });

  test("名前・linked_item_id のどちらも一致しない場合は undefined", () => {
    const rows = [makeRow({ id: "a", name: "牛乳" })];

    expect(findDuplicatePlannedItem(rows, { name: "パン" })).toBeUndefined();
  });

  test("空配列に対しては常に undefined", () => {
    expect(findDuplicatePlannedItem([], { name: "牛乳" })).toBeUndefined();
  });

  test("linked_item_id が null の入力は名前一致のみで判定する", () => {
    const rows = [makeRow({ id: "a", name: "牛乳", linked_item_id: "item-1" })];

    expect(findDuplicatePlannedItem(rows, { name: "牛乳", linked_item_id: null })?.id).toBe("a");
  });
});
