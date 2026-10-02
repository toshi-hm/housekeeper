import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { selectLowStockDailyGoods } from "./selection.ts";

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "item-1",
  name: "洗剤",
  units: 1,
  minimum_stock: 1,
  opened_remaining: null,
  deleted_at: null,
  item_type: null,
  categories: { kind: "daily_goods" },
  ...overrides,
});

Deno.test("selectLowStockDailyGoods includes daily goods at or below their minimum", () => {
  assertEquals(selectLowStockDailyGoods([row()]).length, 1);
  assertEquals(selectLowStockDailyGoods([row({ units: 0 })]).length, 1);
  assertEquals(selectLowStockDailyGoods([row({ units: 2 })]).length, 0);
});

Deno.test("selectLowStockDailyGoods resolves item override before category kind", () => {
  assertEquals(selectLowStockDailyGoods([row({ item_type: "food" })]).length, 0);
  assertEquals(
    selectLowStockDailyGoods([row({ item_type: "daily_goods", categories: { kind: "food" } })])
      .length,
    1,
  );
});

Deno.test("selectLowStockDailyGoods skips unset thresholds and deleted items", () => {
  assertEquals(selectLowStockDailyGoods([row({ minimum_stock: null })]).length, 0);
  assertEquals(selectLowStockDailyGoods([row({ deleted_at: "2026-01-01T00:00:00Z" })]).length, 0);
});
