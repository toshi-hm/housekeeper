import { expect, test } from "@playwright/test";

import { installSupabaseMock, loginAsFakeUser } from "./fixtures/supabaseMock";

/**
 * PWA offline regression coverage (#518): docs/specs/features/pwa.md documents
 * a network-first cache strategy plus "block mutations while offline" contract.
 * This spec drives that contract at the application layer — the already-loaded
 * item list must stay visible once `navigator.onLine` flips false, mutation
 * attempts must surface the offline toast (`requireOnline()` /
 * `src/lib/requireOnline.ts`), and actions must succeed again once back online.
 *
 * It does not exercise the actual Service Worker cache (workbox NetworkFirst in
 * src/sw.ts) — see e2e/README.md for why and what would be needed to close that gap.
 */
test.describe("PWA オフライン挙動", () => {
  test.beforeEach(async ({ page }) => {
    await installSupabaseMock(page);
    await loginAsFakeUser(page);
  });

  test("オフライン中も一覧が表示され、変更操作はブロックされ、復帰後は再度操作できる", async ({
    page,
    context,
  }) => {
    const itemName = `E2E Offline Item ${Date.now()}`;

    await page.getByRole("link", { name: "Add Item" }).first().click();
    await page.waitForURL(/\/items\/new$/);
    await page.locator("#name").fill(itemName);
    await page.locator('button[type="submit"]').click();
    // The dashboard route always serializes its (default-valued) search params into
    // the URL, so match an optional trailing query string too (#658).
    await page.waitForURL(/\/(\?.*)?$/);
    await expect(page.getByText(itemName)).toBeVisible();

    // Visit the item detail page once while still online so its own query
    // (`useItem(id)`, keyed separately from the dashboard's list query) is
    // cached before we go offline — otherwise navigating there while offline
    // hits an uncached query, which is paused/never resolves and renders
    // the page's "not found" branch instead of the cached detail (#658).
    await page.getByRole("link", { name: itemName }).click();
    await page.waitForURL(/\/items\/[^/]+$/);
    await page.getByRole("link", { name: "Home" }).click();
    await page.waitForURL(/\/(\?.*)?$/);

    // --- Go offline ---
    await context.setOffline(true);

    // Already-fetched data must remain visible from the in-memory query cache.
    await expect(page.getByText(itemName)).toBeVisible();

    // A mutation attempt (consume) must be blocked with the offline toast rather
    // than hanging on a network request that will never resolve.
    // ItemCard's clickable overlay is an aria-labeled <Link>, not the visible
    // text node directly — target it by accessible name (#658).
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
    await expect(page.getByText("Cannot perform this action while offline")).toBeVisible();

    // --- Back online ---
    await context.setOffline(false);
    await page.getByRole("button", { name: "Use", exact: true }).click();
    await page.waitForURL(/\/items\/[^/]+$/);
  });
});
