import { describe, expect, test } from "bun:test";

import { parseExpiryDateFromOcrText } from "./expiryDateOcr";

describe("parseExpiryDateFromOcrText", () => {
  test("parses YY.MM.DD (2桁年、ドット区切り)", () => {
    expect(parseExpiryDateFromOcrText("25.12.31")).toBe("2025-12-31");
  });

  test("parses YYYY/MM/DD (4桁年、スラッシュ区切り)", () => {
    expect(parseExpiryDateFromOcrText("2025/12/31")).toBe("2025-12-31");
  });

  test("parses YYYY-MM-DD (4桁年、ハイフン区切り)", () => {
    expect(parseExpiryDateFromOcrText("2025-12-31")).toBe("2025-12-31");
  });

  test("parses YY/MM/DD with single-digit month/day", () => {
    expect(parseExpiryDateFromOcrText("25/1/5")).toBe("2025-01-05");
  });

  test("keeps a leading keyword label ('賞味期限')", () => {
    expect(parseExpiryDateFromOcrText("賞味期限 25.12.31")).toBe("2025-12-31");
  });

  test("parses YYYY年MM月DD日 (和暦風の年月日表記)", () => {
    expect(parseExpiryDateFromOcrText("2025年12月31日")).toBe("2025-12-31");
  });

  test("parses YY年MM月DD日 (2桁年の年月日表記)", () => {
    expect(parseExpiryDateFromOcrText("25年12月31日")).toBe("2025-12-31");
  });

  test("parses compact YYYYMMDD digits with no separator", () => {
    expect(parseExpiryDateFromOcrText("20251231")).toBe("2025-12-31");
  });

  test("parses compact YYMMDD digits with no separator", () => {
    expect(parseExpiryDateFromOcrText("251231")).toBe("2025-12-31");
  });

  test("tolerates stray whitespace around separators from noisy OCR", () => {
    expect(parseExpiryDateFromOcrText("25 . 12 . 31")).toBe("2025-12-31");
  });

  test("corrects common OCR letter/digit confusions (l -> 1, O -> 0)", () => {
    expect(parseExpiryDateFromOcrText("25.12.3l")).toBe("2025-12-31");
    expect(parseExpiryDateFromOcrText("O5.12.31")).toBe("2005-12-31");
  });

  test("prefers a date near an expiry keyword over an unrelated numeric run", () => {
    const text = "税込498円 賞味期限25.12.31 バーコード4901234567894";
    expect(parseExpiryDateFromOcrText(text)).toBe("2025-12-31");
  });

  test("returns null for empty input", () => {
    expect(parseExpiryDateFromOcrText("")).toBeNull();
  });

  test("returns null for whitespace-only input", () => {
    expect(parseExpiryDateFromOcrText("   \n  ")).toBeNull();
  });

  test("returns null for text with no digits", () => {
    expect(parseExpiryDateFromOcrText("Lorem ipsum dolor sit amet")).toBeNull();
  });

  test("returns null for an invalid month", () => {
    expect(parseExpiryDateFromOcrText("13.45.99")).toBeNull();
  });

  test("returns null for a day that doesn't exist in the given month (Feb 30)", () => {
    expect(parseExpiryDateFromOcrText("2025.02.30")).toBeNull();
  });

  test("returns null for a day that doesn't exist in the given month (Sep 31)", () => {
    expect(parseExpiryDateFromOcrText("2025-09-31")).toBeNull();
  });

  test("returns null for pure garbage digits with no valid calendar interpretation", () => {
    expect(parseExpiryDateFromOcrText("999999")).toBeNull();
  });
});
