import { expect, test } from "@playwright/test";

import { installSupabaseMock, loginAsFakeUser } from "./fixtures/supabaseMock";

const USER_ID = "00000000-0000-4000-8000-000000000001";

test.describe("月次予算バナー (#991)", () => {
  test("当月の支出が予算に対する割合とともに表示される", async ({ page }) => {
    const store = await installSupabaseMock(page);
    store.user_settings[0]!.monthly_budget = 30000;
    const now = new Date();
    store.items.push({
      id: "41000000-0000-4000-8000-000000000001",
      user_id: USER_ID,
      name: "E2E Expiring Item",
      units: 1,
      content_amount: 1,
      content_unit: "pcs",
      category_id: null,
      barcode: null,
      deleted_at: null,
      expiry_date: now.toISOString().slice(0, 10),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
    store.item_lots.push({
      id: "40000000-0000-4000-8000-000000000001",
      user_id: USER_ID,
      unit_price: 1000,
      purchased_units: 3,
      purchase_date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
    });

    await loginAsFakeUser(page);
    await page.getByRole("button", { name: /expired or expiring soon/ }).click();

    const banner = page.getByRole("status").filter({ hasText: "This month's spending" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("10%");
    await expect(banner).toContainText("¥3,000");
    await expect(banner).toContainText("¥30,000");
  });
});
