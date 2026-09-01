import assert from "node:assert/strict";

import { findDuplicatePlannedItem, type ShoppingPlannedRow } from "./shoppingDuplicates.ts";

const makeRow = (overrides: Partial<ShoppingPlannedRow> = {}): ShoppingPlannedRow => ({
  id: "row-1",
  name: "牛乳",
  desired_units: 1,
  linked_item_id: null,
  ...overrides,
});

Deno.test("findDuplicatePlannedItem (#946) - 同一 linked_item_id を持つ行を重複として検出する", () => {
  const rows = [makeRow({ id: "row-1", name: "牛乳", linked_item_id: "item-1" })];
  const duplicate = findDuplicatePlannedItem(rows, { name: "牛乳", linked_item_id: "item-1" });
  assert.strictEqual(duplicate?.id, "row-1");
});

Deno.test("findDuplicatePlannedItem (#946) - linked_item_id が異なれば重複としない", () => {
  const rows = [makeRow({ id: "row-1", name: "牛乳", linked_item_id: "item-1" })];
  const duplicate = findDuplicatePlannedItem(rows, { name: "豆乳", linked_item_id: "item-2" });
  assert.strictEqual(duplicate, undefined);
});

Deno.test("findDuplicatePlannedItem (#946) - 前後空白・大文字小文字を無視した同名一致で重複を検出する", () => {
  const rows = [makeRow({ id: "row-1", name: "Milk", linked_item_id: null })];
  const duplicate = findDuplicatePlannedItem(rows, { name: "  milk  ", linked_item_id: null });
  assert.strictEqual(duplicate?.id, "row-1");
});

Deno.test("findDuplicatePlannedItem (#946) - 名前が異なり linked_item_id もなければ重複としない", () => {
  const rows = [makeRow({ id: "row-1", name: "牛乳", linked_item_id: null })];
  const duplicate = findDuplicatePlannedItem(rows, { name: "卵", linked_item_id: null });
  assert.strictEqual(duplicate, undefined);
});

Deno.test("findDuplicatePlannedItem (#946) - 行が空なら重複なし", () => {
  const duplicate = findDuplicatePlannedItem([], { name: "牛乳", linked_item_id: null });
  assert.strictEqual(duplicate, undefined);
});
