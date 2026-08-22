import { describe, expect, test } from "bun:test";

import {
  createBlankDraftItem,
  draftItemToFormValues,
  isReceiptDraftValid,
  type ReceiptDraftItem,
  receiptLineItemToDraft,
} from "@/types/receipt";

const makeDraft = (overrides: Partial<ReceiptDraftItem> = {}): ReceiptDraftItem => ({
  id: "d1",
  name: "牛乳",
  quantity: 1,
  unitPrice: 200,
  confidence: "high",
  categoryId: null,
  storageLocationId: null,
  expiryDate: null,
  included: true,
  ...overrides,
});

describe("receiptLineItemToDraft", () => {
  test("carries over name/quantity/unitPrice/confidence and defaults the rest to unset", () => {
    const draft = receiptLineItemToDraft({
      name: "牛乳",
      quantity: 2,
      unitPrice: 200,
      confidence: "low",
    });
    expect(draft.name).toBe("牛乳");
    expect(draft.quantity).toBe(2);
    expect(draft.unitPrice).toBe(200);
    expect(draft.confidence).toBe("low");
    expect(draft.categoryId).toBeNull();
    expect(draft.storageLocationId).toBeNull();
    expect(draft.expiryDate).toBeNull();
    expect(draft.included).toBe(true);
    expect(draft.id.length).toBeGreaterThan(0);
  });

  test("assigns a unique id to each draft", () => {
    const a = receiptLineItemToDraft({
      name: "a",
      quantity: 1,
      unitPrice: null,
      confidence: "high",
    });
    const b = receiptLineItemToDraft({
      name: "b",
      quantity: 1,
      unitPrice: null,
      confidence: "high",
    });
    expect(a.id).not.toBe(b.id);
  });
});

describe("createBlankDraftItem", () => {
  test("creates an empty, included, high-confidence row", () => {
    const draft = createBlankDraftItem();
    expect(draft.name).toBe("");
    expect(draft.quantity).toBe(1);
    expect(draft.unitPrice).toBeNull();
    expect(draft.confidence).toBe("high");
    expect(draft.included).toBe(true);
  });
});

describe("isReceiptDraftValid", () => {
  test("valid when included with a non-empty name and quantity >= 1", () => {
    expect(isReceiptDraftValid(makeDraft())).toBe(true);
  });

  test("invalid when excluded", () => {
    expect(isReceiptDraftValid(makeDraft({ included: false }))).toBe(false);
  });

  test("invalid when the name is empty or whitespace-only", () => {
    expect(isReceiptDraftValid(makeDraft({ name: "" }))).toBe(false);
    expect(isReceiptDraftValid(makeDraft({ name: "   " }))).toBe(false);
  });

  test("invalid when quantity is below 1", () => {
    expect(isReceiptDraftValid(makeDraft({ quantity: 0 }))).toBe(false);
  });
});

describe("draftItemToFormValues", () => {
  test("maps fields into ItemFormValues with barcode unset and content_amount/unit defaults", () => {
    const values = draftItemToFormValues(
      makeDraft({
        name: "  牛乳  ",
        quantity: 3,
        unitPrice: 200,
        categoryId: "cat-1",
        storageLocationId: "loc-1",
        expiryDate: "2026-08-20",
      }),
    );
    expect(values).toMatchObject({
      name: "牛乳",
      barcode: undefined,
      category_id: "cat-1",
      storage_location_id: "loc-1",
      units: 3,
      content_amount: 1,
      content_unit: "個",
      unit_price: 200,
      expiry_date: "2026-08-20",
      auto_reorder: false,
    });
  });

  test("omits expiry_date when the draft has none", () => {
    const values = draftItemToFormValues(makeDraft({ expiryDate: null }));
    expect(values.expiry_date).toBeUndefined();
  });

  test("floors a fractional quantity to at least 1 unit", () => {
    const values = draftItemToFormValues(makeDraft({ quantity: 0.4 }));
    expect(values.units).toBe(1);
  });

  test("carries the receipt-level store name into store_name", () => {
    const values = draftItemToFormValues(makeDraft(), "○○スーパー");
    expect(values.store_name).toBe("○○スーパー");
  });

  test("trims the store name", () => {
    const values = draftItemToFormValues(makeDraft(), "  ○○スーパー  ");
    expect(values.store_name).toBe("○○スーパー");
  });

  test("maps a whitespace-only store name to null", () => {
    const values = draftItemToFormValues(makeDraft(), "   ");
    expect(values.store_name).toBeNull();
  });

  test("maps a null store name to null", () => {
    const values = draftItemToFormValues(makeDraft(), null);
    expect(values.store_name).toBeNull();
  });

  test("maps an omitted store name to null", () => {
    const values = draftItemToFormValues(makeDraft());
    expect(values.store_name).toBeNull();
  });
});
