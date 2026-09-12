import { describe, expect, test } from "bun:test";

import type { Item } from "@/types/item";

import { upsertItemInListCache } from "./itemCache";

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: "item-1",
  user_id: "user-1",
  name: "牛乳",
  units: 1,
  content_amount: 1000,
  content_unit: "mL",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("upsertItemInListCache", () => {
  test("キャッシュが配列でない場合は undefined を返す（キャッシュ未初期化時に何もしない）", () => {
    expect(upsertItemInListCache(undefined, makeItem())).toBeUndefined();
    expect(upsertItemInListCache(null, makeItem())).toBeUndefined();
    expect(upsertItemInListCache({ notAnArray: true }, makeItem())).toBeUndefined();
  });

  test("id が一致する既存アイテムは置き換える（新規追加しない）", () => {
    const existing = [makeItem({ id: "a" }), makeItem({ id: "b" })];
    const incoming = makeItem({ id: "b", name: "更新後" });

    const result = upsertItemInListCache(existing, incoming);

    expect(result).toHaveLength(2);
    expect(result?.find((item) => item.id === "b")?.name).toBe("更新後");
  });

  test("id が一致しない場合は新規アイテムとして追加する", () => {
    const existing = [makeItem({ id: "a" })];
    const incoming = makeItem({ id: "b" });

    const result = upsertItemInListCache(existing, incoming);

    expect(result).toHaveLength(2);
    expect(result?.map((item) => item.id)).toEqual(expect.arrayContaining(["a", "b"]));
  });

  describe("ソート順（サーバー .order() の意味論と一致させる）", () => {
    test("expiry_date は昇順、null は末尾（サーバーの nullsFirst: false 相当）", () => {
      const items = [
        makeItem({ id: "no-expiry", expiry_date: null }),
        makeItem({ id: "late", expiry_date: "2026-06-01" }),
        makeItem({ id: "soon", expiry_date: "2026-01-15" }),
      ];

      const result = upsertItemInListCache(items, makeItem({ id: "no-expiry" }), "expiry_date");

      expect(result?.map((item) => item.id)).toEqual(["soon", "late", "no-expiry"]);
    });

    test("purchase_date は降順（新しい購入が先）、null は末尾", () => {
      const items = [
        makeItem({ id: "no-date", purchase_date: null }),
        makeItem({ id: "old", purchase_date: "2026-01-01" }),
        makeItem({ id: "new", purchase_date: "2026-06-01" }),
      ];

      const result = upsertItemInListCache(items, makeItem({ id: "no-date" }), "purchase_date");

      expect(result?.map((item) => item.id)).toEqual(["new", "old", "no-date"]);
    });

    test("既定（created_at）は降順（新しく作成した順）", () => {
      const items = [
        makeItem({ id: "old", created_at: "2026-01-01T00:00:00Z" }),
        makeItem({ id: "new", created_at: "2026-06-01T00:00:00Z" }),
      ];

      const result = upsertItemInListCache(items, makeItem({ id: "old" }));

      expect(result?.map((item) => item.id)).toEqual(["new", "old"]);
    });

    test("両方 null の場合は入れ替えない（安定した順序）", () => {
      const items = [
        makeItem({ id: "a", expiry_date: null }),
        makeItem({ id: "b", expiry_date: null }),
      ];

      const result = upsertItemInListCache(items, makeItem({ id: "a" }), "expiry_date");

      expect(result?.map((item) => item.id)).toEqual(["a", "b"]);
    });
  });

  test("元のキャッシュ配列を直接変更しない（イミュータブル）", () => {
    const existing = [makeItem({ id: "a" })];
    upsertItemInListCache(existing, makeItem({ id: "b" }));

    expect(existing).toHaveLength(1);
  });
});
