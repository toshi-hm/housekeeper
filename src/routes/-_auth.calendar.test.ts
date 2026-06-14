import { describe, expect, test } from "bun:test";

import { computeCalendarDelta } from "./_auth.calendar";

describe("computeCalendarDelta", () => {
  test("封印済みユニットのみの場合: units × contentAmount", () => {
    expect(computeCalendarDelta(3, null, 500)).toBe(1500);
  });

  test("units=1 封印済みのみの場合", () => {
    expect(computeCalendarDelta(1, null, 200)).toBe(200);
  });

  test("units=0 かつ openedRemaining あり: opened_remaining のみ", () => {
    expect(computeCalendarDelta(0, 150, 500)).toBe(150);
  });

  test("units=2 かつ openedRemaining あり: (units-1)*contentAmount + openedRemaining", () => {
    // 2本中1本開封済み(残250mL) + 未開封1本(500mL) = 750mL
    expect(computeCalendarDelta(2, 250, 500)).toBe(750);
  });

  test("units=1 かつ openedRemaining あり: openedRemaining のみ（封印ゼロ）", () => {
    // 1本のみ開封中で残300mL（未開封は0）
    expect(computeCalendarDelta(1, 300, 500)).toBe(300);
  });

  test("openedRemaining=0 の場合: 0 を返す（全量消費済み）", () => {
    expect(computeCalendarDelta(1, 0, 500)).toBe(0);
  });

  test("contentAmount が小数の場合も正確に計算する", () => {
    expect(computeCalendarDelta(2, null, 1.5)).toBeCloseTo(3.0);
  });
});
