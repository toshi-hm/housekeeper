import { describe, expect, test } from "bun:test";

import { computeReceiptPriceIncreaseAlert, type ReceiptPriceHistoryRow } from "./receiptPriceAlert";

const row = (overrides: Partial<ReceiptPriceHistoryRow> = {}): ReceiptPriceHistoryRow => ({
  itemName: "牛乳",
  storeName: "スーパーA",
  unitPrice: 200,
  purchaseDate: "2026-08-01",
  createdAt: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

describe("computeReceiptPriceIncreaseAlert (#941)", () => {
  test("no history data at all: no alert", () => {
    expect(computeReceiptPriceIncreaseAlert([], "牛乳", "スーパーA", 250)).toBeNull();
  });

  test("only 1 historical data point for the item×store pair: no alert", () => {
    const history = [row({ unitPrice: 200 })];
    expect(computeReceiptPriceIncreaseAlert(history, "牛乳", "スーパーA", 250)).toBeNull();
  });

  test("2+ data points but current price is at/below the baseline: no alert", () => {
    const history = [
      row({ unitPrice: 200, purchaseDate: "2026-07-01" }),
      row({ unitPrice: 200, purchaseDate: "2026-08-01" }),
    ];
    // 現在値200円は基準単価200円と同じ（値上がり無し）
    expect(computeReceiptPriceIncreaseAlert(history, "牛乳", "スーパーA", 200)).toBeNull();
    // 現在値190円は基準単価より下落
    expect(computeReceiptPriceIncreaseAlert(history, "牛乳", "スーパーA", 190)).toBeNull();
  });

  test("2+ data points but the increase is below the 10% threshold: no alert", () => {
    const history = [
      row({ unitPrice: 200, purchaseDate: "2026-07-01" }),
      row({ unitPrice: 200, purchaseDate: "2026-08-01" }),
    ];
    // +9%は閾値未満
    expect(computeReceiptPriceIncreaseAlert(history, "牛乳", "スーパーA", 218)).toBeNull();
  });

  test("2+ data points with current price above the 10% threshold: alert", () => {
    const history = [
      row({ unitPrice: 200, purchaseDate: "2026-07-01" }),
      row({ unitPrice: 200, purchaseDate: "2026-08-01" }),
    ];
    // +25%（250円 vs 基準200円）
    const alert = computeReceiptPriceIncreaseAlert(history, "牛乳", "スーパーA", 250);
    expect(alert).not.toBeNull();
    expect(alert?.baselinePrice).toBe(200);
    expect(alert?.currentPrice).toBe(250);
    expect(alert?.increasePercent).toBe(25);
  });

  test("exact threshold boundary (+10%): alert (>= threshold, not strictly greater)", () => {
    const history = [
      row({ unitPrice: 200, purchaseDate: "2026-07-01" }),
      row({ unitPrice: 200, purchaseDate: "2026-08-01" }),
    ];
    const alert = computeReceiptPriceIncreaseAlert(history, "牛乳", "スーパーA", 220);
    expect(alert).not.toBeNull();
    expect(alert?.increasePercent).toBe(10);
  });

  test("item name mismatch (no fuzzy matching, #990 is separate scope): no alert", () => {
    const history = [
      row({ itemName: "牛乳", unitPrice: 200, purchaseDate: "2026-07-01" }),
      row({ itemName: "牛乳", unitPrice: 200, purchaseDate: "2026-08-01" }),
    ];
    // 表記揺れ（"牛乳" vs "成分無調整牛乳"）は完全一致しないためマッチしない
    expect(
      computeReceiptPriceIncreaseAlert(history, "成分無調整牛乳", "スーパーA", 250),
    ).toBeNull();
  });

  test("store name mismatch: no alert (history exists only for a different store)", () => {
    const history = [
      row({ storeName: "スーパーA", unitPrice: 200, purchaseDate: "2026-07-01" }),
      row({ storeName: "スーパーA", unitPrice: 200, purchaseDate: "2026-08-01" }),
    ];
    expect(computeReceiptPriceIncreaseAlert(history, "牛乳", "スーパーB", 250)).toBeNull();
  });

  test("rows with unit_price null are excluded from the match count", () => {
    const history = [
      row({ unitPrice: null, purchaseDate: "2026-06-01" }),
      row({ unitPrice: 200, purchaseDate: "2026-07-01" }),
    ];
    // 単価nullの行を除くと1件しか残らないためアラート無し
    expect(computeReceiptPriceIncreaseAlert(history, "牛乳", "スーパーA", 250)).toBeNull();
  });

  test("current unit price is null or non-positive: no alert regardless of history", () => {
    const history = [
      row({ unitPrice: 200, purchaseDate: "2026-07-01" }),
      row({ unitPrice: 200, purchaseDate: "2026-08-01" }),
    ];
    expect(computeReceiptPriceIncreaseAlert(history, "牛乳", "スーパーA", null)).toBeNull();
    expect(computeReceiptPriceIncreaseAlert(history, "牛乳", "スーパーA", 0)).toBeNull();
  });

  test("empty item name or store name: no alert", () => {
    const history = [
      row({ unitPrice: 200, purchaseDate: "2026-07-01" }),
      row({ unitPrice: 200, purchaseDate: "2026-08-01" }),
    ];
    expect(computeReceiptPriceIncreaseAlert(history, "", "スーパーA", 250)).toBeNull();
    expect(computeReceiptPriceIncreaseAlert(history, "牛乳", null, 250)).toBeNull();
    expect(computeReceiptPriceIncreaseAlert(history, "牛乳", "   ", 250)).toBeNull();
  });

  test("stored store name with surrounding whitespace still matches after trimming(#1024)", () => {
    const history = [
      row({ storeName: "スーパーA ", unitPrice: 200, purchaseDate: "2026-07-01" }),
      row({ storeName: "スーパーA\n", unitPrice: 200, purchaseDate: "2026-08-01" }),
    ];
    const alert = computeReceiptPriceIncreaseAlert(history, "牛乳", "スーパーA", 250);
    expect(alert).not.toBeNull();
    expect(alert?.baselinePrice).toBe(200);
  });

  test("baseline uses the average of only the most recent RECENT_HISTORY_LIMIT (5) entries", () => {
    // 6件の履歴のうち、最新5件の平均が基準単価になる（最古の1件=100円は除外される）。
    const history = [
      row({ unitPrice: 100, purchaseDate: "2026-01-01" }),
      row({ unitPrice: 200, purchaseDate: "2026-02-01" }),
      row({ unitPrice: 200, purchaseDate: "2026-03-01" }),
      row({ unitPrice: 200, purchaseDate: "2026-04-01" }),
      row({ unitPrice: 200, purchaseDate: "2026-05-01" }),
      row({ unitPrice: 200, purchaseDate: "2026-06-01" }),
    ];
    const alert = computeReceiptPriceIncreaseAlert(history, "牛乳", "スーパーA", 250);
    expect(alert?.baselinePrice).toBe(200);
  });
});
