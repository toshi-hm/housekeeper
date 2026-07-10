import { describe, expect, test } from "bun:test";

import i18n from "@/lib/i18n";

describe("i18n 初期化設定", () => {
  test("フォールバック言語は ja", () => {
    expect(i18n.options.fallbackLng).toEqual(["ja"]);
  });

  test("サポート言語は ja / en", () => {
    expect(i18n.options.supportedLngs).toContain("ja");
    expect(i18n.options.supportedLngs).toContain("en");
  });

  test("全 namespace が登録されている", () => {
    expect(i18n.options.ns).toEqual([
      "common",
      "items",
      "auth",
      "settings",
      "shopping",
      "stats",
      "notifications",
      "calendar",
    ]);
    expect(i18n.options.defaultNS).toBe("common");
  });

  test("interpolation.escapeValue は false", () => {
    expect(i18n.options.interpolation?.escapeValue).toBe(false);
  });

  test("ja / en 両言語のリソースが読み込まれている", () => {
    for (const ns of ["common", "items", "settings", "shopping", "calendar", "notifications"]) {
      expect(i18n.hasResourceBundle("ja", ns)).toBe(true);
      expect(i18n.hasResourceBundle("en", ns)).toBe(true);
    }
    expect(i18n.getFixedT("ja")("common:cancel")).toBe("キャンセル");
    expect(i18n.getFixedT("en")("common:cancel")).toBe("Cancel");
  });
});
