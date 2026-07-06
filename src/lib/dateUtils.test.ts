import { describe, expect, test } from "bun:test";

import { parseLocalDate } from "./dateUtils";

describe("parseLocalDate", () => {
  test("parses a YYYY-MM-DD string into a local Date at midnight", () => {
    const result = parseLocalDate("2026-07-06");
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(6);
    expect(result.getDate()).toBe(6);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  test("does not shift the date across a UTC day boundary", () => {
    const result = parseLocalDate("2026-01-01");
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(1);
  });

  test("handles the last day of a leap-year February", () => {
    const result = parseLocalDate("2024-02-29");
    expect(result.getFullYear()).toBe(2024);
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(29);
  });

  test("handles the last day of the year", () => {
    const result = parseLocalDate("2026-12-31");
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(11);
    expect(result.getDate()).toBe(31);
  });
});
