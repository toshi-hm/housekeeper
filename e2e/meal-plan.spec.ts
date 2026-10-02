import { expect, test } from "@playwright/test";

import { installSupabaseMock, loginAsFakeUser } from "./fixtures/supabaseMock";

test.describe("週間献立プランナー (#715)", () => {
  test("空き枠に食事メモを割り当てて保存できる", async ({ page }) => {
    const store = await installSupabaseMock(page);
    store.meal_plans = [];

    await loginAsFakeUser(page);
    await page.goto("/meal-plan");
    await expect(page.getByRole("heading", { name: "Weekly Meal Planner" })).toBeVisible();

    await page.getByRole("button", { name: "Tap to plan a meal" }).first().click();
    await page.getByRole("button", { name: "Note only" }).click();
    await page.getByRole("textbox", { name: "Note only" }).fill("Dinner out");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Dinner out")).toBeVisible();
    await expect.poll(() => store.meal_plans[0]?.note).toBe("Dinner out");
    expect(store.meal_plans[0]?.recipe_id).toBeNull();
  });
});
