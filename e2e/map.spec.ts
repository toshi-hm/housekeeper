import { expect, test } from "@playwright/test";

import { installSupabaseMock, loginAsFakeUser } from "./fixtures/supabaseMock";

test.describe("マップタブ", () => {
  test("フッターの左から3番目にマップがあり、検索画面を開ける", async ({ page }) => {
    await installSupabaseMock(page);
    await loginAsFakeUser(page);

    const mapLink = page.getByRole("link", { name: "Map" }).last();
    await expect(mapLink).toBeVisible();
    await mapLink.click();
    await page.waitForURL(/\/map$/);
    await expect(page.getByPlaceholder("Search by item name or barcode")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Search results" })).toBeVisible();
  });
});
