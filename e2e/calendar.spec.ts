import { expect, test } from "@playwright/test";

import { installSupabaseMock, loginAsFakeUser } from "./fixtures/supabaseMock";

const toDateInputValue = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * 期限カレンダーのチェックオフフロー (#658): 期限内のロットをチェックすると
 * 消費記録され、取り消し可能な「保留中の削除」バナーに載る。
 *
 * See e2e/README.md for the Supabase mocking strategy this depends on.
 */
test.describe("期限カレンダーのチェックオフフロー", () => {
  test.beforeEach(async ({ page }) => {
    await installSupabaseMock(page);
    await loginAsFakeUser(page);
  });

  test("期限内のアイテムをチェックすると消費記録され、取り消せる", async ({ page }) => {
    const itemName = `E2E Calendar Item ${Date.now()}`;

    // --- Add an item expiring today (within "this month") ---
    await page.getByRole("link", { name: "Add Item" }).first().click();
    await page.waitForURL(/\/items\/new$/);
    await page.locator("#name").fill(itemName);
    await page.locator("#expiry_date").fill(toDateInputValue(new Date()));
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/(\?.*)?$/);
    await expect(page.getByText(itemName)).toBeVisible();

    // --- Check it off on the calendar page ---
    await page.goto("/calendar");
    const checkbox = page.getByRole("checkbox", { name: itemName });
    await expect(checkbox).toBeVisible();
    await checkbox.check();
    await expect(checkbox).toBeChecked();

    // Checking off shows an undo-able pending removal entry (no auto-expiry).
    const undoButton = page.getByRole("button", { name: `Undo (${itemName})` });
    await expect(undoButton).toBeVisible();

    // --- Undo restores the lot and clears the pending removal ---
    await undoButton.click();
    await expect(undoButton).not.toBeVisible();
  });
});
