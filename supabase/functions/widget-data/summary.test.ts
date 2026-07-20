import assert from "node:assert/strict";
import { buildWidgetSummary, type WidgetItemInput } from "./summary.ts";

const TODAY = "2026-07-20";
const NOW_ISO = "2026-07-20T00:00:00.000Z";

const item = (overrides: Partial<WidgetItemInput> = {}): WidgetItemInput => ({
  name: "テスト商品",
  units: 1,
  expiry_date: null,
  opened_remaining: null,
  minimum_stock: null,
  ...overrides,
});

Deno.test("buildWidgetSummary - empty items returns zeroed summary", () => {
  const summary = buildWidgetSummary([], TODAY, 3, NOW_ISO);
  assert.deepStrictEqual(summary, {
    generated_at: NOW_ISO,
    expired_count: 0,
    expiring_soon_count: 0,
    low_stock_count: 0,
    top_expiring: [],
    top_low_stock: [],
  });
});

Deno.test("buildWidgetSummary - classifies expired vs expiring-soon using warningDays", () => {
  const items = [
    item({ name: "期限切れ", expiry_date: "2026-07-19" }),
    item({ name: "今日期限", expiry_date: "2026-07-20" }),
    item({ name: "3日後", expiry_date: "2026-07-23" }),
    item({ name: "10日後（対象外）", expiry_date: "2026-07-30" }),
  ];
  const summary = buildWidgetSummary(items, TODAY, 3, NOW_ISO);
  assert.strictEqual(summary.expired_count, 1);
  assert.strictEqual(summary.expiring_soon_count, 2);
  assert.strictEqual(summary.top_expiring.length, 3);
  assert.strictEqual(summary.top_expiring[0].name, "期限切れ");
  assert.strictEqual(summary.top_expiring[0].status, "expired");
});

Deno.test("buildWidgetSummary - excludes units<=0 and opened_remaining=0 from expiry counts", () => {
  const items = [
    item({ name: "在庫なし", units: 0, expiry_date: "2026-07-19" }),
    item({ name: "開封済み・空", units: 1, opened_remaining: 0, expiry_date: "2026-07-19" }),
    item({ name: "対象", units: 1, expiry_date: "2026-07-19" }),
  ];
  const summary = buildWidgetSummary(items, TODAY, 3, NOW_ISO);
  assert.strictEqual(summary.expired_count, 1);
  assert.strictEqual(summary.top_expiring[0].name, "対象");
});

Deno.test("buildWidgetSummary - low stock counts units <= minimum_stock, including 0 units", () => {
  const items = [
    item({ name: "低在庫", units: 1, minimum_stock: 2 }),
    item({ name: "在庫切れ", units: 0, minimum_stock: 1 }),
    item({ name: "十分", units: 5, minimum_stock: 2 }),
    item({ name: "未設定", units: 0, minimum_stock: null }),
  ];
  const summary = buildWidgetSummary(items, TODAY, 3, NOW_ISO);
  assert.strictEqual(summary.low_stock_count, 2);
  const names = summary.top_low_stock.map((i) => i.name).sort();
  assert.deepStrictEqual(names, ["低在庫", "在庫切れ"].sort());
});

Deno.test("buildWidgetSummary - sorts top_expiring by expiry_date ascending and caps at WIDGET_TOP_N", () => {
  const items = Array.from({ length: 8 }, (_, i) =>
    item({ name: `item-${i}`, expiry_date: `2026-07-${String(19 - i).padStart(2, "0")}` }),
  );
  const summary = buildWidgetSummary(items, TODAY, 3, NOW_ISO);
  assert.strictEqual(summary.top_expiring.length, 5);
  const dates = summary.top_expiring.map((i) => i.expiry_date);
  const sorted = [...dates].sort();
  assert.deepStrictEqual(dates, sorted);
});

Deno.test("buildWidgetSummary - items without expiry_date are 'unknown' and excluded", () => {
  const items = [item({ name: "期限日なし", expiry_date: null })];
  const summary = buildWidgetSummary(items, TODAY, 3, NOW_ISO);
  assert.strictEqual(summary.expired_count, 0);
  assert.strictEqual(summary.expiring_soon_count, 0);
  assert.strictEqual(summary.top_expiring.length, 0);
});
