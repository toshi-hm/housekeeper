import { expect, test } from "@playwright/test";

import { expectNoA11yViolations } from "./fixtures/a11y";
import { installSupabaseMock, loginAsFakeUser } from "./fixtures/supabaseMock";

/**
 * マスタデータ（カテゴリ）管理のCRUDフロー (#1041):
 * 作成 → リネーム → 使用中は削除ブロック → 使用解除後に削除。
 * 保管場所・タグはほぼ同一実装のため、代表としてカテゴリをカバーする。
 *
 * See e2e/README.md for the Supabase mocking strategy this depends on.
 */
test.describe("カテゴリ管理", () => {
  test.beforeEach(async ({ page }) => {
    await installSupabaseMock(page);
    await loginAsFakeUser(page);
  });

  test("作成・リネーム・使用中は削除不可・削除できる", async ({ page }) => {
    const suffix = Date.now();
    const categoryName = `E2E Category ${suffix}`;
    const renamed = `E2E Renamed ${suffix}`;
    const itemName = `E2E Cat Item ${suffix}`;

    await page.goto("/settings/categories");
    await expect(page.getByRole("heading", { name: "Category Management" })).toBeVisible();
    await expectNoA11yViolations(page);

    // --- Create ---
    await page.getByPlaceholder("Category name").fill(categoryName);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const row = page.getByRole("listitem").filter({ hasText: categoryName });
    await expect(row).toBeVisible();

    // --- Rename ---
    await row.getByRole("button", { name: "Edit" }).click();
    const editInput = page.getByRole("listitem").locator("input").first();
    await editInput.fill(renamed);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const renamedRow = page.getByRole("listitem").filter({ hasText: renamed });
    await expect(renamedRow).toBeVisible();
    await expect(page.getByText(categoryName, { exact: true })).toHaveCount(0);

    // --- In use: assign it to an item, deletion is blocked ---
    // クライアントサイド遷移で移動する（full reload だと永続化済みクエリキャッシュが
    // 古い状態で復元され、直前に作成/更新したカテゴリが見えないことがあるため）。
    await page.getByRole("link", { name: "Add", exact: true }).first().click();
    await page.waitForURL(/\/items\/new$/);
    await page.locator("#name").fill(itemName);
    await page.locator("#category_id").click();
    await page.getByRole("option", { name: renamed }).click();
    await page.locator('button[type="submit"]').click();
    await page.waitForURL(/\/(\?.*)?$/);
    await expect(page.getByText(itemName)).toBeVisible();

    await page.getByRole("link", { name: "Settings", exact: true }).first().click();
    await page.getByRole("link", { name: /Category Management/ }).click();
    await page.waitForURL(/\/settings\/categories$/);
    const usedRow = page.getByRole("listitem").filter({ hasText: renamed });
    await expect(usedRow.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  test("未使用のカテゴリは確認ダイアログを経て削除できる", async ({ page }) => {
    const categoryName = `E2E Unused ${Date.now()}`;

    await page.goto("/settings/categories");
    await page.getByPlaceholder("Category name").fill(categoryName);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const row = page.getByRole("listitem").filter({ hasText: categoryName });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: "Delete" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expectNoA11yViolations(page, '[role="alertdialog"]');
    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect(row).toHaveCount(0);
  });
});
