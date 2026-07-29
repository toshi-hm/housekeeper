import { expect, test } from "@playwright/test";

import { installSupabaseMock, loginAsFakeUser } from "./fixtures/supabaseMock";

/**
 * レシピ提案(構成アイテムを登録し、一括消費する)からの消費記録フロー (#658)。
 *
 * See e2e/README.md for the Supabase mocking strategy this depends on.
 */
test.describe("レシピ実行による消費記録フロー", () => {
  test.beforeEach(async ({ page }) => {
    await installSupabaseMock(page);
    await loginAsFakeUser(page);
  });

  test("レシピを作成して実行すると在庫が消費される", async ({ page }) => {
    const itemName = `E2E Recipe Ingredient ${Date.now()}`;

    // --- Add an item to use as the recipe's single ingredient ---
    await page.getByRole("link", { name: "Add Item" }).first().click();
    await page.waitForURL(/\/items\/new$/);
    await page.locator("#name").fill(itemName);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/(\?.*)?$/);
    await expect(page.getByText(itemName)).toBeVisible();

    // --- Create a recipe using that item ---
    await page.getByRole("link", { name: "Recipes" }).click();
    await page.waitForURL(/\/recipes$/);
    await page.getByRole("button", { name: "Create Recipe" }).click();

    const recipeName = `E2E Recipe ${Date.now()}`;
    await page.locator("#recipe-name").fill(recipeName);
    // The item select defaults to the only available item, and the amount
    // input defaults to 1 (matching the item's default content_amount of 1),
    // so no further form changes are needed before saving.
    await page.getByRole("button", { name: "Create Recipe" }).click();

    await expect(page.getByText(recipeName)).toBeVisible();

    // --- Execute the recipe: consumes the linked item's stock ---
    await page.getByRole("button", { name: "Run", exact: true }).click();
    await expect(page.getByText("Consumed 1 item")).toBeVisible();
  });
});
