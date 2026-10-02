import { expect, test } from "@playwright/test";

import { installSupabaseMock, loginAsFakeUser } from "./fixtures/supabaseMock";

const USER_ID = "00000000-0000-4000-8000-000000000001";

test.describe("食品ロス統計とストリーク (#925)", () => {
  test("廃棄統計と週次ゼロロス記録を表示する", async ({ page }) => {
    const store = await installSupabaseMock(page);
    const categoryId = store.categories[0]!.id;
    store.items.push({
      id: "30000000-0000-4000-8000-000000000001",
      user_id: USER_ID,
      name: "E2E Wasted Apples",
      category_id: categoryId,
      deleted_at: new Date().toISOString(),
      deletion_reason: "expired_waste",
      units: 1,
      content_amount: 1,
      opened_remaining: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    store.waste_streaks = [
      {
        user_id: USER_ID,
        current_streak_weeks: 3,
        longest_streak_weeks: 4,
        last_evaluated_week: new Date().toISOString().slice(0, 10),
      },
    ];

    await loginAsFakeUser(page);
    await page.goto("/stats");

    await expect(page.getByRole("heading", { name: "Stats" })).toBeVisible();
    await expect(page.getByText("3-week zero-waste streak")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Food Waste (Discard Count)" })).toBeVisible();
  });
});
