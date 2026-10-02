import { expect, test } from "@playwright/test";

import { installSupabaseMock, loginAsFakeUser } from "./fixtures/supabaseMock";

const USER_ID = "00000000-0000-4000-8000-000000000001";
const ITEM_ID = "50000000-0000-4000-8000-000000000001";

test.describe("類似アイテム名の提案 (#990)", () => {
  test("近い名前を入力すると既存アイテムへのリンクを提案する", async ({ page }) => {
    const store = await installSupabaseMock(page);
    store.items.push({
      id: ITEM_ID,
      user_id: USER_ID,
      name: "Onion",
      units: 1,
      content_amount: 1,
      content_unit: "pcs",
      barcode: null,
      category_id: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await loginAsFakeUser(page);
    await page.goto("/items/new");
    await page.locator("#name").fill("Onionz");
    await page.locator("#barcode").focus();

    const suggestion = page.getByRole("status").filter({ hasText: 'A similar item "Onion"' });
    await expect(suggestion).toContainText('A similar item "Onion" already exists');
    await suggestion.getByRole("button", { name: "View it" }).click();
    await page.waitForURL(new RegExp(`/items/${ITEM_ID}(\\?.*)?$`));
    await expect(page.getByRole("heading", { name: "Onion" })).toBeVisible();
  });
});
