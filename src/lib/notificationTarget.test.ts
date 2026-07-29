import { describe, expect, test } from "bun:test";

import { resolveNotificationTargetUrl } from "@/lib/notificationTarget";

describe("resolveNotificationTargetUrl (#671)", () => {
  test("data.urlが相対パスの文字列ならそれを返す", () => {
    expect(resolveNotificationTargetUrl({ url: "/items/abc-123" })).toBe("/items/abc-123");
    expect(resolveNotificationTargetUrl({ url: "/calendar?date=2026-08-01" })).toBe(
      "/calendar?date=2026-08-01",
    );
  });

  test('dataが無い場合は既定の"/"を返す', () => {
    expect(resolveNotificationTargetUrl(undefined)).toBe("/");
    expect(resolveNotificationTargetUrl(null)).toBe("/");
  });

  test('urlフィールドが無い場合は既定の"/"を返す', () => {
    expect(resolveNotificationTargetUrl({})).toBe("/");
    expect(resolveNotificationTargetUrl({ other: "value" })).toBe("/");
  });

  test('urlが文字列以外の場合は既定の"/"を返す', () => {
    expect(resolveNotificationTargetUrl({ url: 123 })).toBe("/");
    expect(resolveNotificationTargetUrl({ url: null })).toBe("/");
  });

  test('外部オリジンへの絶対URLは拒否して既定の"/"を返す（オープンリダイレクト対策）', () => {
    expect(resolveNotificationTargetUrl({ url: "https://evil.example.com" })).toBe("/");
    expect(resolveNotificationTargetUrl({ url: "//evil.example.com" })).toBe("/");
  });

  test('dataがオブジェクトでない場合は既定の"/"を返す', () => {
    expect(resolveNotificationTargetUrl("not an object")).toBe("/");
    expect(resolveNotificationTargetUrl(42)).toBe("/");
  });
});
