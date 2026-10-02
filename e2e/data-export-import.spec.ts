import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { installSupabaseMock, loginAsFakeUser } from "./fixtures/supabaseMock";

/** JSON backup round trip: export an active item, restore into an empty store,
 * then export again to verify that the imported item and lot are present. */
test("JSONバックアップをエクスポートして在庫を復元できる", async ({ page }) => {
  const store = await installSupabaseMock(page);
  const itemId = "10000000-0000-4000-8000-000000000001";
  const itemName = "E2E Backup Item";
  store.items.push({
    id: itemId,
    user_id: "00000000-0000-4000-8000-000000000001",
    name: itemName,
    barcode: "4900000001065",
    category_id: null,
    storage_location_id: null,
    units: 2,
    content_amount: 500,
    content_unit: "mL",
    opened_remaining: null,
    expiry_date: "2027-03-31",
    expiry_type: "best_before",
    purchase_date: "2026-09-01",
    notes: "backup round trip",
    deleted_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  });
  store.item_lots.push({
    id: "20000000-0000-4000-8000-000000000001",
    user_id: "00000000-0000-4000-8000-000000000001",
    item_id: itemId,
    units: 2,
    opened_remaining: null,
    unit_price: 180,
    purchase_date: "2026-09-01",
    expiry_date: "2027-03-31",
    store_name: null,
    opened_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  });

  await loginAsFakeUser(page);
  await page.goto("/settings");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const backup = await readFile(downloadPath!, "utf8");
  const exported = JSON.parse(backup) as {
    version: number;
    items: Array<{ name: string; lots: Array<{ units: number; unit_price: number | null }> }>;
  };
  expect(exported.version).toBe(2);
  expect(exported.items).toHaveLength(1);
  expect(exported.items[0]).toMatchObject({
    name: itemName,
    lots: [{ units: 2, unit_price: 180 }],
  });

  // Simulate restoring this backup to a fresh account without a real backend.
  store.items.splice(0);
  store.item_lots.splice(0);
  await page.locator('input[type="file"]').setInputFiles({
    name: "inventory-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(backup),
  });
  await expect(page.getByText("1 item found")).toBeVisible();
  await page.getByRole("button", { name: "Import", exact: true }).click();
  const confirmDialog = page.getByRole("alertdialog");
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Import complete: 1 added, 0 updated, 0 skipped")).toBeVisible();

  const restoredDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download JSON" }).click();
  const restoredDownload = await restoredDownloadPromise;
  const restoredPath = await restoredDownload.path();
  expect(restoredPath).not.toBeNull();
  const restored = JSON.parse(await readFile(restoredPath!, "utf8")) as {
    items: Array<{ name: string; lots: Array<{ units: number; unit_price: number | null }> }>;
  };
  expect(restored.items).toHaveLength(1);
  expect(restored.items[0]).toMatchObject({
    name: itemName,
    lots: [{ units: 2, unit_price: 180 }],
  });
});
