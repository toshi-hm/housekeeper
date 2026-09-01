import assert from "node:assert/strict";

import { dropExpiryForDailyGoods, resolveItemType } from "./itemType.ts";

Deno.test("resolveItemType (#937) - アイテム側の item_type が設定されていればそれを優先する", () => {
  assert.strictEqual(resolveItemType("daily_goods", "food"), "daily_goods");
});

Deno.test("resolveItemType (#937) - アイテム側が未設定ならカテゴリのkindにフォールバックする", () => {
  assert.strictEqual(resolveItemType(null, "daily_goods"), "daily_goods");
});

Deno.test("resolveItemType (#937) - どちらも未設定ならfoodを既定値とする", () => {
  assert.strictEqual(resolveItemType(null, null), "food");
  assert.strictEqual(resolveItemType(undefined, undefined), "food");
});

interface TestItem {
  name: string;
  item_type: "food" | "daily_goods" | null;
  categories?: { kind: "food" | "daily_goods" | null } | null;
  expiry_date: string | null;
}

Deno.test("dropExpiryForDailyGoods (#966) - アイテム個別のitem_typeがdaily_goodsならexpiry_dateをnullにする", () => {
  const items: TestItem[] = [
    { name: "洗剤", item_type: "daily_goods", categories: null, expiry_date: "2026-01-01" },
  ];
  const result = dropExpiryForDailyGoods(items);
  assert.strictEqual(result[0]?.expiry_date, null);
});

Deno.test("dropExpiryForDailyGoods (#966) - カテゴリのkindがdaily_goodsならexpiry_dateをnullにする", () => {
  const items: TestItem[] = [
    {
      name: "トイレットペーパー",
      item_type: null,
      categories: { kind: "daily_goods" },
      expiry_date: "2026-01-01",
    },
  ];
  const result = dropExpiryForDailyGoods(items);
  assert.strictEqual(result[0]?.expiry_date, null);
});

Deno.test("dropExpiryForDailyGoods (#966) - foodのアイテムはexpiry_dateを保持する", () => {
  const items: TestItem[] = [
    { name: "牛乳", item_type: null, categories: { kind: "food" }, expiry_date: "2026-01-01" },
  ];
  const result = dropExpiryForDailyGoods(items);
  assert.strictEqual(result[0]?.expiry_date, "2026-01-01");
});

Deno.test("dropExpiryForDailyGoods (#966) - expiry_dateがnullの場合はそのまま", () => {
  const items: TestItem[] = [
    { name: "米", item_type: "daily_goods", categories: null, expiry_date: null },
  ];
  const result = dropExpiryForDailyGoods(items);
  assert.strictEqual(result[0]?.expiry_date, null);
});

Deno.test("dropExpiryForDailyGoods (#966) - アイテム個別のitem_typeがカテゴリより優先される", () => {
  const items: TestItem[] = [
    {
      name: "例外アイテム",
      item_type: "food",
      categories: { kind: "daily_goods" },
      expiry_date: "2026-01-01",
    },
  ];
  const result = dropExpiryForDailyGoods(items);
  assert.strictEqual(result[0]?.expiry_date, "2026-01-01");
});
