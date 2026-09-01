import assert from "node:assert/strict";

import { findDuplicatePlannedItem, type ShoppingPlannedRow } from "./shoppingDuplicates.ts";

const makeRow = (overrides: Partial<ShoppingPlannedRow> = {}): ShoppingPlannedRow => ({
  id: "row-1",
  name: "牛乳",
  desired_units: 1,
  linked_item_id: null,
  ...overrides,
});

Deno.test("findDuplicatePlannedItem (#946) - linked_item_id が一致する行を重複とみなす", () => {
  const rows = [makeRow({ id: "row-1", name: "牛乳", linked_item_id: "item-1" })];
  const duplicate = findDuplicatePlannedItem(rows, { name: "別名", linked_item_id: "item-1" });
  assert.strictEqual(duplicate?.id, "row-1");
});

Deno.test("findDuplicatePlannedItem (#946) - 前後空白/大文字小文字を無視した名前一致を重複とみなす", () => {
  const rows = [makeRow({ id: "row-1", name: " Milk ", linked_item_id: null })];
  const duplicate = findDuplicatePlannedItem(rows, { name: "milk", linked_item_id: null });
  assert.strictEqual(duplicate?.id, "row-1");
});

Deno.test("findDuplicatePlannedItem (#946) - 一致する行がなければ undefined を返す", () => {
  const rows = [makeRow({ id: "row-1", name: "牛乳", linked_item_id: "item-1" })];
  const duplicate = findDuplicatePlannedItem(rows, { name: "パン", linked_item_id: "item-2" });
  assert.strictEqual(duplicate, undefined);
});

Deno.test("findDuplicatePlannedItem (#946) - linked_item_id が null の入力は名前一致のみで判定する", () => {
  const rows = [makeRow({ id: "row-1", name: "牛乳", linked_item_id: "item-1" })];
  const duplicate = findDuplicatePlannedItem(rows, { name: "パン", linked_item_id: null });
  assert.strictEqual(duplicate, undefined);
});
