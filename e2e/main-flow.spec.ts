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
    // The dashboard route always serializes its (default-valued) search params into
    // the URL, so match an optional trailing query string too (#658).
    await page.waitForURL(/\/(\?.*)?$/);
    await expect(page.getByText(itemName)).toBeVisible();

    // --- Consume ---
    // ItemCard renders an absolutely-positioned <Link aria-label={item.name}>
    // overlay on top of the card's visible text (so the whole card is
    // clickable), so target that overlay by its accessible name instead of
    // the underlying text node — clicking the text directly makes Playwright's
    // actionability check spin forever on "element intercepts pointer events"
    // even though a real click at that point does land on (and navigate via)
    // the overlay (#658).
    await page.getByRole("link", { name: itemName }).click();
    await page.waitForURL(/\/items\/[^/]+$/);
    // The item detail page's "Use" action is a Button that calls navigate()
    // programmatically, not a Link (#658 — the E2E spec had drifted from
    // this since it was never actually run in CI due to #664).
    await page.getByRole("button", { name: "Use" }).click();
    // The item detail page carries a `tab` search param that survives this
    // navigation (e.g. "?tab=info"), so match an optional trailing query
    // string here too (#658).
    await page.waitForURL(/\/consume(\?.*)?$/);
    await page.locator("#delta").fill("1");
    // exact:true avoids matching the sibling "Use all (1pcs)" button (#658).
    await page.getByRole("button", { name: "Use", exact: true }).click();
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
