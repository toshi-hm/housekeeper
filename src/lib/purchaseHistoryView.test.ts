import { describe, expect, test } from "bun:test";

import { groupArchivedItemsByDate } from "@/lib/purchaseHistoryView";
import type { ArchivedShoppingItem } from "@/types/shopping";

/**
 * ローカル日時から ISO 文字列を作る。`new Date(y, m-1, d, h)` はランナーのタイムゾーンで
 * 解釈されるため、`toISOString()` で往復させても `groupArchivedItemsByDate` 側の
 * `new Date(...).getFullYear()` 等（ローカル解釈）は同じ年月日を返す。タイムゾーンに
 * 依存せずテストを安定させるための helper。
 */
const localIso = (y: number, m: number, d: number, h = 12): string =>
  new Date(y, m - 1, d, h).toISOString();

const makeArchivedItem = (overrides: Partial<ArchivedShoppingItem> = {}): ArchivedShoppingItem => ({
  id: "archive-1",
  user_id: "user-1",
  name: "牛乳",
  desired_units: 1,
  note: null,
  archived_at: localIso(2026, 7, 18, 12),
  ...overrides,
});

describe("groupArchivedItemsByDate", () => {
  test("空配列なら空配列を返す", () => {
    expect(groupArchivedItemsByDate([])).toEqual([]);
  });

  test("同じ日付の行を1グループにまとめる", () => {
    const items = [
      makeArchivedItem({ id: "a", archived_at: localIso(2026, 7, 18, 9) }),
      makeArchivedItem({ id: "b", archived_at: localIso(2026, 7, 18, 15) }),
    ];
    const groups = groupArchivedItemsByDate(items);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  test("異なる日付は別グループになり、新しい日付が先頭にくる", () => {
    const items = [
      makeArchivedItem({ id: "old", archived_at: localIso(2026, 7, 1, 9) }),
      makeArchivedItem({ id: "new", archived_at: localIso(2026, 7, 18, 9) }),
    ];
    const groups = groupArchivedItemsByDate(items);
    expect(groups).toHaveLength(2);
    expect(groups[0]?.items[0]?.id).toBe("new");
    expect(groups[1]?.items[0]?.id).toBe("old");
  });

  test("各グループ内は元の並び順を維持する", () => {
    const items = [
      makeArchivedItem({ id: "first", name: "牛乳" }),
      makeArchivedItem({ id: "second", name: "卵" }),
    ];
    const groups = groupArchivedItemsByDate(items);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(["first", "second"]);
  });

  test("dateKey は YYYY-MM-DD 形式のローカル日付になる", () => {
    const items = [makeArchivedItem({ archived_at: localIso(2026, 1, 5, 12) })];
    const groups = groupArchivedItemsByDate(items);
    expect(groups[0]?.dateKey).toBe("2026-01-05");
  });
});
