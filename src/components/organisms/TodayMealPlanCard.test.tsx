import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, mock, spyOn } from "bun:test";
import { I18nextProvider } from "react-i18next";

import * as useItemsModule from "@/hooks/useItems";
import * as useMasterDataModule from "@/hooks/useMasterData";
import * as useMealPlansModule from "@/hooks/useMealPlans";
import type { ExecuteRecipeResult } from "@/hooks/useRecipes";
import * as useRecipesModule from "@/hooks/useRecipes";
import * as useShoppingListModule from "@/hooks/useShoppingList";
import { toLocalDateKey } from "@/lib/dateUtils";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";
import type { Item } from "@/types/item";
import type { MealPlanWithRecipe } from "@/types/mealPlan";
import type { RecipeWithItems } from "@/types/recipe";

import { TodayMealPlanCard } from "./TodayMealPlanCard";

const today = toLocalDateKey(new Date());

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: "item-1",
  user_id: "u1",
  name: "牛乳",
  units: 2,
  content_amount: 1000,
  content_unit: "mL",
  category_id: null,
  item_type: null,
  expiry_date: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

const recipe: RecipeWithItems = {
  id: "recipe-1",
  user_id: "u1",
  name: "肉じゃが",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  items: [
    {
      id: "ri-1",
      recipe_id: "recipe-1",
      item_id: "item-1",
      amount: 1,
      created_at: "2024-01-01T00:00:00Z",
    },
  ],
};

const makePlan = (overrides: Partial<MealPlanWithRecipe> = {}): MealPlanWithRecipe => ({
  id: "plan-1",
  user_id: "u1",
  planned_date: today,
  recipe_id: recipe.id,
  note: null,
  executed_at: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  recipe,
  ...overrides,
});

const mockCommonHooks = () => {
  spyOn(useItemsModule, "useItems").mockReturnValue({
    data: [makeItem()],
  } as unknown as ReturnType<typeof useItemsModule.useItems>);
  spyOn(useMasterDataModule, "useCategories").mockReturnValue({
    data: [],
  } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
};

/** `TodayMealPlanCard` は `<Link to="/meal-plan">` を含むため、`WeeklyMealPlanner`
 *  同様に実際の `RouterProvider` でラップしないと `useRouter must be used inside a
 *  <RouterProvider>` で失敗する（`SecurityQuestionReminderBanner.test.tsx` と同じ方針）。 */
const renderCard = async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const stubToast: ToastContextValue = { toasts: [], toast: () => "", dismiss: () => {} };
  const rootRoute = createRootRoute({
    component: () => <TodayMealPlanCard />,
  });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ToastContext.Provider value={stubToast}>
            <RouterProvider router={router} />
          </ToastContext.Provider>
        </I18nextProvider>
      </QueryClientProvider>,
    );
  });
  return result;
};

describe("TodayMealPlanCard (#1035)", () => {
  it("読み込み中は何もクラッシュせずスケルトンを表示する", async () => {
    mockCommonHooks();
    spyOn(useMealPlansModule, "useMealPlans").mockReturnValue({
      slots: [],
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useMealPlansModule.useMealPlans>);
    spyOn(useMealPlansModule, "useExecuteMealPlan").mockReturnValue({
      mutateAsync: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof useMealPlansModule.useExecuteMealPlan>);
    spyOn(useShoppingListModule, "useUpsertShoppingItem").mockReturnValue({
      mutateAsync: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof useShoppingListModule.useUpsertShoppingItem>);

    const { queryByText } = await renderCard();
    expect(queryByText(i18n.t("mealPlan:todayCardTitle"))).toBeNull();
  });

  it("読み込みエラー時はエラーメッセージを表示する", async () => {
    mockCommonHooks();
    spyOn(useMealPlansModule, "useMealPlans").mockReturnValue({
      slots: [],
      isLoading: false,
      error: new Error("boom"),
    } as unknown as ReturnType<typeof useMealPlansModule.useMealPlans>);
    spyOn(useMealPlansModule, "useExecuteMealPlan").mockReturnValue({
      mutateAsync: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof useMealPlansModule.useExecuteMealPlan>);
    spyOn(useShoppingListModule, "useUpsertShoppingItem").mockReturnValue({
      mutateAsync: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof useShoppingListModule.useUpsertShoppingItem>);

    const { getByRole, getByText } = await renderCard();
    expect(getByRole("alert")).toBeTruthy();
    expect(getByText(i18n.t("mealPlan:loadError"))).toBeTruthy();
  });

  it("今日の献立が未設定なら、タップで献立プランナーへ誘導するリンクを表示する", async () => {
    mockCommonHooks();
    spyOn(useMealPlansModule, "useMealPlans").mockReturnValue({
      slots: [{ date: today, plan: null }],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMealPlansModule.useMealPlans>);
    spyOn(useMealPlansModule, "useExecuteMealPlan").mockReturnValue({
      mutateAsync: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof useMealPlansModule.useExecuteMealPlan>);
    spyOn(useShoppingListModule, "useUpsertShoppingItem").mockReturnValue({
      mutateAsync: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof useShoppingListModule.useUpsertShoppingItem>);

    const { getByText, getByRole } = await renderCard();
    expect(getByText(i18n.t("mealPlan:todayCardTitle"))).toBeTruthy();
    const link = getByRole("link", { name: i18n.t("mealPlan:todayCardEmpty") });
    expect(link.getAttribute("href")).toBe("/meal-plan");
  });

  it("メモのみの割当なら、メモをそのまま表示する", async () => {
    mockCommonHooks();
    spyOn(useMealPlansModule, "useMealPlans").mockReturnValue({
      slots: [{ date: today, plan: makePlan({ recipe_id: null, recipe: null, note: "外食予定" }) }],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMealPlansModule.useMealPlans>);
    spyOn(useMealPlansModule, "useExecuteMealPlan").mockReturnValue({
      mutateAsync: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof useMealPlansModule.useExecuteMealPlan>);
    spyOn(useShoppingListModule, "useUpsertShoppingItem").mockReturnValue({
      mutateAsync: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof useShoppingListModule.useUpsertShoppingItem>);

    const { getByText } = await renderCard();
    expect(getByText("外食予定")).toBeTruthy();
  });

  it("在庫が足りているレシピは在庫OK表示のまま実行ボタンでexecuteMealPlanを呼ぶ", async () => {
    mockCommonHooks();
    spyOn(useRecipesModule, "fetchFefoLotByItemId").mockResolvedValue({
      "item-1": { units: 2, opened_remaining: null },
    } as unknown as Awaited<ReturnType<typeof useRecipesModule.fetchFefoLotByItemId>>);

    spyOn(useMealPlansModule, "useMealPlans").mockReturnValue({
      slots: [{ date: today, plan: makePlan() }],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMealPlansModule.useMealPlans>);

    const executeResult: ExecuteRecipeResult = {
      status: "executed",
      consumedItemIds: ["item-1"],
      skippedItemIds: [],
      failedItemIds: [],
      shortages: [],
      logInsertFailed: false,
    };
    const executeMutateAsync = mock(() => Promise.resolve(executeResult));
    spyOn(useMealPlansModule, "useExecuteMealPlan").mockReturnValue({
      mutateAsync: executeMutateAsync,
    } as unknown as ReturnType<typeof useMealPlansModule.useExecuteMealPlan>);
    spyOn(useShoppingListModule, "useUpsertShoppingItem").mockReturnValue({
      mutateAsync: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof useShoppingListModule.useUpsertShoppingItem>);

    const { getByText, getByRole } = await renderCard();
    await waitFor(() => {
      expect(getByText(i18n.t("mealPlan:stockOk"))).toBeTruthy();
    });

    fireEvent.click(getByRole("button", { name: i18n.t("mealPlan:execute") }));

    await waitFor(() => {
      expect(executeMutateAsync).toHaveBeenCalledTimes(1);
    });
    const call = executeMutateAsync.mock.calls[0]?.[0] as { mealPlanId: string; force: boolean };
    expect(call.mealPlanId).toBe("plan-1");
    expect(call.force).toBe(false);
  });

  it("在庫不足の場合は不足一覧と『買い物リストに追加』ボタンを表示し、クリックでupsertShoppingItemを呼ぶ", async () => {
    mockCommonHooks();
    spyOn(useRecipesModule, "fetchFefoLotByItemId").mockResolvedValue({
      "item-1": { units: 0, opened_remaining: null },
    } as unknown as Awaited<ReturnType<typeof useRecipesModule.fetchFefoLotByItemId>>);

    spyOn(useMealPlansModule, "useMealPlans").mockReturnValue({
      slots: [{ date: today, plan: makePlan() }],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMealPlansModule.useMealPlans>);
    spyOn(useMealPlansModule, "useExecuteMealPlan").mockReturnValue({
      mutateAsync: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof useMealPlansModule.useExecuteMealPlan>);

    const upsertMutateAsync = mock(() => Promise.resolve());
    spyOn(useShoppingListModule, "useUpsertShoppingItem").mockReturnValue({
      mutateAsync: upsertMutateAsync,
    } as unknown as ReturnType<typeof useShoppingListModule.useUpsertShoppingItem>);

    const { getByText, getByRole } = await renderCard();
    await waitFor(() => {
      expect(getByText(i18n.t("mealPlan:stockShortageTitle"))).toBeTruthy();
    });

    fireEvent.click(getByRole("button", { name: i18n.t("mealPlan:addMissingToShoppingList") }));

    await waitFor(() => {
      expect(upsertMutateAsync).toHaveBeenCalledTimes(1);
    });
    expect(upsertMutateAsync.mock.calls[0]?.[0]).toEqual({
      name: "牛乳",
      linked_item_id: "item-1",
      desired_units: 1,
    });
  });

  it("実行済みの枠は完了バッジを表示し、実行ボタンを無効化する", async () => {
    mockCommonHooks();
    spyOn(useRecipesModule, "fetchFefoLotByItemId").mockResolvedValue({
      "item-1": { units: 2, opened_remaining: null },
    } as unknown as Awaited<ReturnType<typeof useRecipesModule.fetchFefoLotByItemId>>);

    spyOn(useMealPlansModule, "useMealPlans").mockReturnValue({
      slots: [{ date: today, plan: makePlan({ executed_at: "2024-01-02T00:00:00Z" }) }],
      isLoading: false,
      error: null,
    } as unknown as ReturnType<typeof useMealPlansModule.useMealPlans>);
    spyOn(useMealPlansModule, "useExecuteMealPlan").mockReturnValue({
      mutateAsync: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof useMealPlansModule.useExecuteMealPlan>);
    spyOn(useShoppingListModule, "useUpsertShoppingItem").mockReturnValue({
      mutateAsync: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof useShoppingListModule.useUpsertShoppingItem>);

    const { getByText, getByRole } = await renderCard();
    await waitFor(() => {
      expect(getByText(i18n.t("mealPlan:executedAt"))).toBeTruthy();
    });
    const executeButton = getByRole("button", {
      name: i18n.t("mealPlan:execute"),
    }) as HTMLButtonElement;
    expect(executeButton.disabled).toBe(true);
  });
});
