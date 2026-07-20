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
    await page.waitForURL(/\/$/);
    await expect(page.getByText(itemName)).toBeVisible();

    // --- Go offline ---
    await context.setOffline(true);

    // Already-fetched data must remain visible from the in-memory query cache.
    await expect(page.getByText(itemName)).toBeVisible();

    // A mutation attempt (consume) must be blocked with the offline toast rather
    // than hanging on a network request that will never resolve.
    await page.getByText(itemName).click();
    await page.waitForURL(/\/items\/[^/]+$/);
    await page.getByRole("link", { name: "Use" }).click();
    await page.waitForURL(/\/consume$/);
    await page.locator("#delta").fill("1");
    await page.getByRole("button", { name: "Use" }).click();
    await expect(page.getByText("Cannot perform this action while offline")).toBeVisible();

    // --- Back online ---
    await context.setOffline(false);
    await page.getByRole("button", { name: "Use" }).click();
    await page.waitForURL(/\/items\/[^/]+$/);
  });
});
