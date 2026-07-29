import { afterEach, describe, expect, test } from "bun:test";

import { detectBrowserTimezone, listAvailableTimezones } from "@/lib/timezone";

describe("detectBrowserTimezone (#660)", () => {
  test("実行環境のタイムゾーンを返す", () => {
    expect(typeof detectBrowserTimezone()).toBe("string");
  });
});

describe("listAvailableTimezones (#660)", () => {
  afterEach(() => {
    // @ts-expect-error -- テスト用にIntl.supportedValuesOfを一時的に外す
    delete Intl.supportedValuesOf;
  });

  test("Intl.supportedValuesOfが使える場合はAsia/Tokyoを含む一覧を返す", () => {
    const zones = listAvailableTimezones();
    expect(zones.length).toBeGreaterThan(1);
    expect(zones).toContain("Asia/Tokyo");
  });

  test("Intl.supportedValuesOfが無い環境ではフォールバックの固定リストを返す", () => {
    // @ts-expect-error -- テスト用に一時的に未対応環境を模倣
    delete Intl.supportedValuesOf;
    const zones = listAvailableTimezones();
    expect(zones).toContain("Asia/Tokyo");
    expect(zones).toContain("UTC");
  });
});
