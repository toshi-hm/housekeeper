import assert from "node:assert/strict";

import { type OpenedAlertItemRow, selectOpenedAlertItems } from "./openedAlertSelection.ts";

const daysAgo = (days: number): string => new Date(Date.now() - days * 86400000).toISOString();

const baseRow: OpenedAlertItemRow = {
  id: "item-1",
  name: "しょうゆ",
  opened_at: null,
  days_use_after_opening: null,
  item_type: null,
  categories: null,
};

Deno.test("selectOpenedAlertItems (#967) - 開封後経過日数がアイテム個別のしきい値を超えていれば対象になる", () => {
  const rows: OpenedAlertItemRow[] = [
    { ...baseRow, opened_at: daysAgo(10), days_use_after_opening: 7 },
  ];
  const result = selectOpenedAlertItems(rows);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0]?.id, "item-1");
  assert.strictEqual(result[0]?.name, "しょうゆ");
  assert.strictEqual(result[0]?.elapsedDays, 10);
});

Deno.test("selectOpenedAlertItems (#967) - 開封後経過日数がしきい値未満なら対象外になる", () => {
  const rows: OpenedAlertItemRow[] = [
    { ...baseRow, opened_at: daysAgo(2), days_use_after_opening: 7 },
  ];
  assert.deepStrictEqual(selectOpenedAlertItems(rows), []);
});

Deno.test("selectOpenedAlertItems (#967) - opened_atが未設定（未開封）なら対象外になる", () => {
  const rows: OpenedAlertItemRow[] = [{ ...baseRow, opened_at: null, days_use_after_opening: 7 }];
  assert.deepStrictEqual(selectOpenedAlertItems(rows), []);
});

Deno.test("selectOpenedAlertItems (#967) - item_typeがdaily_goodsの行は対象外になる（開封後経過日数がしきい値を超えていても）", () => {
  const rows: OpenedAlertItemRow[] = [
    {
      ...baseRow,
      item_type: "daily_goods",
      opened_at: daysAgo(30),
      days_use_after_opening: 7,
    },
  ];
  assert.deepStrictEqual(selectOpenedAlertItems(rows), []);
});

Deno.test("selectOpenedAlertItems (#967) - カテゴリのkindがdaily_goodsの行も対象外になる", () => {
  const rows: OpenedAlertItemRow[] = [
    {
      ...baseRow,
      item_type: null,
      categories: { kind: "daily_goods", days_use_after_opening: null },
      opened_at: daysAgo(30),
      days_use_after_opening: 7,
    },
  ];
  assert.deepStrictEqual(selectOpenedAlertItems(rows), []);
});

Deno.test("selectOpenedAlertItems (#967) - アイテム個別のdays_use_after_openingが未設定ならカテゴリ既定値にフォールバックする", () => {
  const rows: OpenedAlertItemRow[] = [
    {
      ...baseRow,
      days_use_after_opening: null,
      categories: { kind: "food", days_use_after_opening: 5 },
      opened_at: daysAgo(6),
    },
  ];
  const result = selectOpenedAlertItems(rows);
  assert.strictEqual(result.length, 1);
});

Deno.test("selectOpenedAlertItems (#967) - アイテム個別・カテゴリともにdays_use_after_openingが未設定なら対象外になる", () => {
  const rows: OpenedAlertItemRow[] = [
    {
      ...baseRow,
      days_use_after_opening: null,
      categories: { kind: "food", days_use_after_opening: null },
      opened_at: daysAgo(365),
    },
  ];
  assert.deepStrictEqual(selectOpenedAlertItems(rows), []);
});

Deno.test("selectOpenedAlertItems (#967) - 複数行のうち条件を満たす行だけを返す", () => {
  const rows: OpenedAlertItemRow[] = [
    { ...baseRow, id: "due", opened_at: daysAgo(10), days_use_after_opening: 7 },
    { ...baseRow, id: "not-due", opened_at: daysAgo(1), days_use_after_opening: 7 },
    {
      ...baseRow,
      id: "daily-goods",
      item_type: "daily_goods",
      opened_at: daysAgo(100),
      days_use_after_opening: 7,
    },
  ];
  const result = selectOpenedAlertItems(rows);
  assert.deepStrictEqual(
    result.map((item) => item.id),
    ["due"],
  );
});
