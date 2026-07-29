import { expect, test } from "@playwright/test";

import { installSupabaseMock, loginAsFakeUser } from "./fixtures/supabaseMock";

/**
 * ダッシュボードの一括操作フロー (#658): 選択モードに入り、一括で保管場所を
 * 変更する/使い切り済みにする/削除する。
 *
 * See e2e/README.md for the Supabase mocking strategy this depends on.
 */
test.describe("一括操作フロー", () => {
  test.beforeEach(async ({ page }) => {
    await installSupabaseMock(page);
    await loginAsFakeUser(page);
  });

  const addItem = async (page: import("@playwright/test").Page, name: string) => {
    await page.getByRole("link", { name: "Add Item" }).first().click();
    await page.waitForURL(/\/items\/new$/);
    await page.locator("#name").fill(name);
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/(\?.*)?$/);
    await expect(page.getByText(name)).toBeVisible();
  };

  test("選択したアイテムの保管場所を一括変更できる", async ({ page }) => {
    const itemName = `E2E Bulk Move Item ${Date.now()}`;
    await addItem(page, itemName);

    await page.getByRole("button", { name: "Select" }).click();
    await page.getByRole("checkbox", { name: itemName }).click();
    await page.getByRole("button", { name: "Change location" }).click();

    await page.getByRole("combobox", { name: "Change location" }).selectOption({ label: "Fridge" });
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();

    // Selection mode exits after a successful bulk action, back to normal view.
    await expect(page.getByRole("button", { name: "Select" })).toBeVisible();
    await expect(page.getByText(itemName)).toBeVisible();
  });

  test("選択したアイテムを一括で使い切り済みにできる", async ({ page }) => {
    const itemName = `E2E Bulk Consume Item ${Date.now()}`;
    await addItem(page, itemName);

    await page.getByRole("button", { name: "Select" }).click();
    await page.getByRole("checkbox", { name: itemName }).click();
    await page.getByRole("button", { name: "Mark as used up" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Mark as used up" }).click();

    // The dashboard hides empty-stock items by default, so a fully-consumed
    // item disappears from the list once selection mode exits.
    await expect(page.getByRole("button", { name: "Select" })).toBeVisible();
    await expect(page.getByText(itemName)).not.toBeVisible();
  });

  test("選択したアイテムを一括削除できる", async ({ page }) => {
    const itemName = `E2E Bulk Delete Item ${Date.now()}`;
    await addItem(page, itemName);

    await page.getByRole("button", { name: "Select" }).click();
    await page.getByRole("checkbox", { name: itemName }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    // DeletionReasonDialog defaults to the "consumed" reason, so confirming
    // directly is enough to exercise the bulk-delete path.
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

    await expect(page.getByRole("button", { name: "Select" })).toBeVisible();
    await expect(page.getByText(itemName)).not.toBeVisible();
  });
});
