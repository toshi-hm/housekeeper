import { beforeEach, describe, expect, test } from "bun:test";

import {
  clearItemFormDraft,
  type ItemFormDraftPayload,
  loadItemFormDraft,
  saveItemFormDraft,
} from "@/lib/itemFormDraft";
import type { ItemFormValues } from "@/types/item";

const makeValues = (overrides: Partial<ItemFormValues> = {}): ItemFormValues => ({
  name: "牛乳",
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
  minimum_stock: null,
  unit_price: null,
  auto_reorder: false,
  reorder_threshold: null,
  pin_x: null,
  pin_y: null,
  ...overrides,
});

const makePayload = (overrides: Partial<ItemFormDraftPayload> = {}): ItemFormDraftPayload => ({
  values: makeValues(),
  unitsRaw: "1",
  contentAmountRaw: "1",
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
});

describe("itemFormDraft (#672)", () => {
  test("保存した下書きを読み込める", () => {
    const payload = makePayload({ values: makeValues({ name: "卵" }) });
    saveItemFormDraft("new", payload);

    const draft = loadItemFormDraft("new");
    expect(draft?.payload).toEqual(payload);
    expect(typeof draft?.savedAt).toBe("string");
  });

  test("下書きが無い場合はnullを返す", () => {
    expect(loadItemFormDraft("new")).toBeNull();
  });

  test("破損したJSONの場合はnullを返す", () => {
    localStorage.setItem("housekeeper:itemFormDraft:new", "{not valid json");
    expect(loadItemFormDraft("new")).toBeNull();
  });

  test("スキーマに一致しない形式の場合はnullを返す", () => {
    localStorage.setItem(
      "housekeeper:itemFormDraft:new",
      JSON.stringify({ savedAt: "2026-01-01", payload: { values: { name: 123 } } }),
    );
    expect(loadItemFormDraft("new")).toBeNull();
  });

  test("clearItemFormDraftで削除できる", () => {
    saveItemFormDraft("new", makePayload());
    clearItemFormDraft("new");
    expect(loadItemFormDraft("new")).toBeNull();
  });

  test("draftKeyごとに独立して保存される", () => {
    saveItemFormDraft("new", makePayload({ values: makeValues({ name: "A" }) }));
    saveItemFormDraft("edit-item-1", makePayload({ values: makeValues({ name: "B" }) }));

    expect(loadItemFormDraft("new")?.payload.values.name).toBe("A");
    expect(loadItemFormDraft("edit-item-1")?.payload.values.name).toBe("B");
  });
});
