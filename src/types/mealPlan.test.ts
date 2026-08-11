import { describe, expect, test } from "bun:test";

import { buildWeekRange, hasMealPlanAssignment } from "@/types/mealPlan";

describe("hasMealPlanAssignment", () => {
  test("recipe_idがあればtrue", () => {
    expect(hasMealPlanAssignment({ recipe_id: "r1", note: null })).toBe(true);
  });

  test("noteがあればtrue", () => {
    expect(hasMealPlanAssignment({ recipe_id: null, note: "外食予定" })).toBe(true);
  });

  test("noteが空白のみの場合はfalse(trim後に判定)", () => {
    expect(hasMealPlanAssignment({ recipe_id: null, note: "   " })).toBe(false);
  });

  test("両方nullならfalse(未割当)", () => {
    expect(hasMealPlanAssignment({ recipe_id: null, note: null })).toBe(false);
  });

  test("recipe_idもnoteも省略された場合はfalse", () => {
    expect(hasMealPlanAssignment({})).toBe(false);
  });
});

describe("buildWeekRange", () => {
  test("今日を含む向こう7日分をYYYY-MM-DDで返す", () => {
    const range = buildWeekRange(new Date(2026, 7, 11)); // 2026-08-11 (local)
    expect(range).toEqual([
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
      "2026-08-16",
      "2026-08-17",
    ]);
  });

  test("月末をまたぐ場合も正しく繰り上がる", () => {
    const range = buildWeekRange(new Date(2026, 7, 29)); // 2026-08-29
    expect(range).toEqual([
      "2026-08-29",
      "2026-08-30",
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
    ]);
  });

  test("時刻部分は無視され、ローカル日付のみで判定される", () => {
    const range = buildWeekRange(new Date(2026, 7, 11, 23, 59, 59));
    expect(range[0]).toBe("2026-08-11");
  });
});
