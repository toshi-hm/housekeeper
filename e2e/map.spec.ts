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

  test("収納場所から2D間取り作成画面へ遷移できる", async ({ page }) => {
    await installSupabaseMock(page);
    const locationsResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/rest/v1/storage_locations") &&
        response.request().method() === "GET",
    );
    await loginAsFakeUser(page);
    const locations = (await (await locationsResponse).json()) as Array<{ id: string }>;
    const locationId = locations[0]?.id;
    expect(locationId).toBeDefined();

    await page.goto(`/locations/${locationId}`);
    await page.getByRole("tab", { name: "2D floor plan" }).click();
    await page.getByRole("button", { name: "Create 2D floor plan" }).click();

    await expect(page).toHaveURL(new RegExp(`/locations/${locationId}/edit$`));
    await expect(page.getByRole("heading", { name: "Edit 2D floor plan" })).toBeVisible();
  });
});
