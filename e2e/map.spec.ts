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

  test("共通間取りと保管場所マーカーを表示できる", async ({ page }) => {
    const store = await installSupabaseMock(page);
    const locationId = String(store.storage_locations[0]?.id);
    store.floor_plans = [
      {
        id: "floor-plan-1",
        user_id: "00000000-0000-4000-8000-000000000001",
        name: "Home plan",
        schema_version: 1,
        document: {
          schemaVersion: 1,
          units: "cm",
          width: 600,
          height: 400,
          gridSize: 10,
          walls: [],
          shapes: [],
        },
        revision: 1,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];
    store.floor_plan_storage_location_markers = [
      {
        id: "marker-1",
        user_id: "00000000-0000-4000-8000-000000000001",
        floor_plan_id: "floor-plan-1",
        storage_location_id: locationId,
        object_id: null,
        x: 120,
        y: 80,
        z: 0,
        rotation: 0,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];
    store.floor_plan_item_placements = [];
    await loginAsFakeUser(page);

    await page.getByRole("link", { name: "Map" }).last().click();
    await page.waitForURL(/\/map$/);
    await expect(page.getByRole("heading", { name: "Shared home floor plan" })).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Storage locations on the floor plan" }),
    ).toContainText("Fridge");
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
    await page.getByRole("button", { name: "Create shared 2D floor plan" }).click();

    await expect(page).toHaveURL(new RegExp(`/locations/${locationId}/edit$`));
    await expect(page.getByRole("heading", { name: "Edit shared 2D floor plan" })).toBeVisible();
  });
});
