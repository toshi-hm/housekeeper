import { expect, test } from "@playwright/test";

import { installSupabaseMock, loginAsFakeUser } from "./fixtures/supabaseMock";

/**
 * Core authenticated flow (#516): add item -> consume -> shopping list.
 *
 * The Supabase backend is faked at the network level (see
 * e2e/fixtures/supabaseMock.ts) rather than run against a real project —
 * see e2e/README.md for why, and what this does and doesn't cover.
 */
test.describe("メイン認証フロー（追加 → 消費 → 買い物リスト）", () => {
  test.beforeEach(async ({ page }) => {
    await installSupabaseMock(page);
    await loginAsFakeUser(page);
  });

  test("アイテムを追加し、消費し、買い物リストに追加できる", async ({ page }) => {
    const itemName = `E2E Test Item ${Date.now()}`;

    // --- Add item ---
    await page.getByRole("link", { name: "Add Item" }).first().click();
    await page.waitForURL(/\/items\/new$/);
    await page.locator("#name").fill(itemName);
    await page.locator('button[type="submit"]').click();

    // Successful create navigates back to the dashboard where the new item is listed.
    await page.waitForURL(/\/$/);
    await expect(page.getByText(itemName)).toBeVisible();

    // --- Consume ---
    await page.getByText(itemName).click();
    await page.waitForURL(/\/items\/[^/]+$/);
    await page.getByRole("link", { name: "Use" }).click();
    await page.waitForURL(/\/consume$/);
    await page.locator("#delta").fill("1");
    await page.getByRole("button", { name: "Use" }).click();
    await page.waitForURL(/\/items\/[^/]+$/);

    // --- Shopping list ---
    await page.getByRole("link", { name: "Shopping" }).click();
    await page.waitForURL(/\/shopping$/);
    const shoppingItemName = `E2E Shopping Item ${Date.now()}`;
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    await page.locator("#add-name").fill(shoppingItemName);
    await page.getByRole("button", { name: "Add", exact: true }).last().click();

    await expect(page.getByText(shoppingItemName)).toBeVisible();
  });
});
