import { describe, expect, test } from "bun:test";

import { findDuplicatePlannedItem, lotValuesFromForm } from "@/hooks/useShoppingList";
import type { ItemFormValues } from "@/types/item";
import type { ShoppingItem } from "@/types/shopping";

const makeFormValues = (overrides: Partial<ItemFormValues> = {}): ItemFormValues => ({
  name: "テスト商品",
  barcode: "",
  category_id: null,
  storage_location_id: null,
  units: 1,
  content_amount: 1,
  content_unit: "個",
  opened_remaining: null,
  purchase_date: "",
  expiry_date: "",
  notes: "",
  image_path: "",
  ...overrides,
});

describe("lotValuesFromForm", () => {
  test("通常値を正しくマッピングする", () => {
    const values = makeFormValues({
      units: 3,
      opened_remaining: 150,
      purchase_date: "2026-06-01",
      expiry_date: "2026-12-31",
    });
    expect(lotValuesFromForm(values)).toEqual({
      units: 3,
      opened_remaining: 150,
      purchase_date: "2026-06-01",
      expiry_date: "2026-12-31",
    });
  });

  test("units が undefined のとき 1 にフォールバックする", () => {
    const values = makeFormValues({ units: undefined });
    expect(lotValuesFromForm(values).units).toBe(1);
  });

  test("opened_remaining が null のとき null を維持する", () => {
    const values = makeFormValues({ opened_remaining: null });
    expect(lotValuesFromForm(values).opened_remaining).toBeNull();
  });

  test("purchase_date が空文字のとき null になる", () => {
    const values = makeFormValues({ purchase_date: "" });
    expect(lotValuesFromForm(values).purchase_date).toBeNull();
  });

  test("expiry_date が空文字のとき null になる", () => {
    const values = makeFormValues({ expiry_date: "" });
    expect(lotValuesFromForm(values).expiry_date).toBeNull();
  });

  test("purchase_date が undefined のとき null になる", () => {
    const values = makeFormValues({ purchase_date: undefined });
    expect(lotValuesFromForm(values).purchase_date).toBeNull();
  });

  test("expiry_date が undefined のとき null になる", () => {
    const values = makeFormValues({ expiry_date: undefined });
    expect(lotValuesFromForm(values).expiry_date).toBeNull();
  });

  test("有効な日付文字列はそのまま保持される", () => {
    const values = makeFormValues({
      purchase_date: "2026-01-15",
      expiry_date: "2026-07-20",
    });
    const result = lotValuesFromForm(values);
    expect(result.purchase_date).toBe("2026-01-15");
    expect(result.expiry_date).toBe("2026-07-20");
  });
});

const makeShoppingItem = (overrides: Partial<ShoppingItem> = {}): ShoppingItem => ({
  id: "row-1",
  user_id: "u-1",
  name: "牛乳",
  desired_units: 1,
  note: null,
  linked_item_id: null,
  status: "planned",
  purchased_at: null,
  created_item_id: null,
  created_at: "2026-07-01T00:00:00Z",
  updated_at: "2026-07-01T00:00:00Z",
  ...overrides,
});

describe("findDuplicatePlannedItem", () => {
  test("同一 linked_item_id を持つ行を重複として検出する (#522, #447)", () => {
    const rows = [makeShoppingItem({ id: "row-1", name: "牛乳", linked_item_id: "item-1" })];
    const duplicate = findDuplicatePlannedItem(rows, { name: "牛乳", linked_item_id: "item-1" });
    expect(duplicate?.id).toBe("row-1");
  });

  test("linked_item_id が異なれば重複としない", () => {
    const rows = [makeShoppingItem({ id: "row-1", name: "牛乳", linked_item_id: "item-1" })];
    const duplicate = findDuplicatePlannedItem(rows, { name: "豆乳", linked_item_id: "item-2" });
    expect(duplicate).toBeUndefined();
  });

  test("前後空白・大文字小文字を無視した同名一致で重複を検出する", () => {
    const rows = [makeShoppingItem({ id: "row-1", name: "Milk", linked_item_id: null })];
    const duplicate = findDuplicatePlannedItem(rows, { name: "  milk  ", linked_item_id: null });
    expect(duplicate?.id).toBe("row-1");
  });

  test("名前が異なり linked_item_id もなければ重複としない", () => {
    const rows = [makeShoppingItem({ id: "row-1", name: "牛乳", linked_item_id: null })];
    const duplicate = findDuplicatePlannedItem(rows, { name: "卵", linked_item_id: null });
    expect(duplicate).toBeUndefined();
  });

  test("行が空なら重複なし", () => {
    const duplicate = findDuplicatePlannedItem([], { name: "牛乳", linked_item_id: null });
    expect(duplicate).toBeUndefined();
  });
});
