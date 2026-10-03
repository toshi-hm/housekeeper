import { expect, test } from "@playwright/test";

import { installSupabaseMock } from "./fixtures/supabaseMock";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const ITEM_ID = "10000000-0000-4000-8000-000000000001";
const LOT_ID = "20000000-0000-4000-8000-000000000001";
const BARCODE = "4901234567890";

test.describe("バーコード即時消費 (#924)", () => {
  test("登録済みバーコードの商品を開封済みロットから1点消費できる", async ({ page }) => {
    const store = await installSupabaseMock(page);
    store.items.push({
      id: ITEM_ID,
      user_id: USER_ID,
      name: "E2E Quick Consume Milk",
      barcode: BARCODE,
      units: 2,
      content_amount: 1000,
      content_unit: "mL",
      opened_remaining: null,
      category_id: null,
      deleted_at: null,
      deletion_reason: null,
      expiry_date: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    store.item_lots.push({
      id: LOT_ID,
      user_id: USER_ID,
      item_id: ITEM_ID,
      units: 2,
      opened_remaining: null,
      opened_at: null,
      expiry_date: "2099-12-31",
      purchase_date: "2026-01-01",
      purchased_units: 2,
      unit_price: null,
    });

    await page.goto("/login");
    await page.locator("#email").fill("e2e@example.test");
    await page.locator("#password").fill("e2e-password-not-checked");
    await page.locator('form button[type="submit"]').click();
    await page.waitForURL(/\/\?.*|\/$/);
    await page.goto("/items/new");

    await page.locator("#barcode").fill(BARCODE);
    await page.getByRole("button", { name: "Search product by barcode" }).click();

    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("E2E Quick Consume Milk")).toBeVisible();
    await expect(sheet.getByRole("button", { name: /Use 1 \(1000mL\)/ })).toBeVisible();
    await sheet.getByRole("button", { name: /Use 1 \(1000mL\)/ }).click();

    await expect(page.getByRole("button", { name: /Undo/ })).toBeVisible();
    await expect.poll(() => store.item_lots[0]?.units).toBe(1);
    expect(store.consumption_logs).toHaveLength(1);
  });
});
