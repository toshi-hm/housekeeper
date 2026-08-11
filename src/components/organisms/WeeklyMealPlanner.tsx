import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/atoms/Skeleton";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { MealSlot } from "@/components/molecules/MealSlot";
import type { MealSlotAssignmentValues } from "@/components/molecules/MealSlotRecipePicker";
import { useItems } from "@/hooks/useItems";
import {
  shortageToShoppingItemInput,
  useExecuteMealPlan,
  useMealPlans,
  useUpsertMealPlan,
} from "@/hooks/useMealPlans";
import { fetchFefoLotByItemId, useRecipes } from "@/hooks/useRecipes";
import { useRecipeSuggestions } from "@/hooks/useRecipeSuggestions";
import { useUpsertShoppingItem } from "@/hooks/useShoppingList";
import { toLocalDateKey } from "@/lib/dateUtils";
import { useToast } from "@/lib/toast-context";
import { getExpiryStatus } from "@/types/item";
import { buildWeekRange, type MealPlanWithRecipe } from "@/types/mealPlan";
import {
  checkRecipeStock,
  rankRecipesByExpiringStock,
  type RecipeShortage,
  type RecipeWithItems,
} from "@/types/recipe";

interface PendingExecution {
  date: string;
  mealPlanId: string;
  recipe: RecipeWithItems;
  shortages: RecipeShortage[];
}

const RECOMMENDATION_LIMIT = 5;

/** 7日分の `MealSlot` を並べる。データ取得・hook呼び出し・在庫確認・
 *  buy/executeのオーケストレーションを持つ（meal-plan.md「画面」節）。 */
export const WeeklyMealPlanner = () => {
  const { t } = useTranslation("mealPlan");
  const { toast } = useToast();

  const range = buildWeekRange();
  const today = toLocalDateKey(new Date());

  const { data: items = [] } = useItems();
  const { data: recipes = [] } = useRecipes();
  const { slots, isLoading, error } = useMealPlans(range);
  const upsertMealPlan = useUpsertMealPlan();
  const executeMealPlan = useExecuteMealPlan();
  const upsertShoppingItem = useUpsertShoppingItem();

  const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));

  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [addingShoppingListDate, setAddingShoppingListDate] = useState<string | null>(null);
  const [executingDate, setExecutingDate] = useState<string | null>(null);
  const [pendingExecution, setPendingExecution] = useState<PendingExecution | null>(null);

  // 割当済みの全レシピの構成アイテムについて、実消費と同じ基準（FEFOロット単位）で
  // まとめて在庫確認するため、対象アイテムIDの和集合を1回のクエリで取得する
  // （`_auth.recipes.tsx` と同じく `fetchFefoLotByItemId` を再利用）。
  const assignedRecipes = slots
    .map((slot) => slot.plan?.recipe)
    .filter((recipe): recipe is RecipeWithItems => Boolean(recipe));
  const stockCheckItemIds = [
    ...new Set(assignedRecipes.flatMap((recipe) => recipe.items.map((i) => i.item_id))),
  ].sort();
  const { data: fefoLotByItemId = {} } = useQuery({
    queryKey: ["meal-plan-fefo-lots", stockCheckItemIds],
    queryFn: () => fetchFefoLotByItemId(stockCheckItemIds),
    enabled: stockCheckItemIds.length > 0,
    staleTime: 30_000,
  });

  // 空き枠向けレコメンド。対象は「期限間近の在庫」全般でありスロットの日付には
  // 依存しないため、週内の全空き枠で共通の結果を使い回す。
  const urgentItems = items.filter((item) => {
    const status = getExpiryStatus(item.expiry_date);
    return (status === "expired" || status === "expiring-soon") && item.units > 0;
  });
  const internalCandidates = rankRecipesByExpiringStock(recipes, itemsById).slice(
    0,
    RECOMMENDATION_LIMIT,
  );
  const externalSuggestItemNames =
    internalCandidates.length === 0
      ? urgentItems.slice(0, RECOMMENDATION_LIMIT).map((i) => i.name)
      : [];
  const { data: externalSuggestions = [], isLoading: isLoadingExternal } =
    useRecipeSuggestions(externalSuggestItemNames);

  const stockCheckFor = (plan: MealPlanWithRecipe | null) => {
    if (!plan?.recipe) return null;
    return checkRecipeStock(plan.recipe.items, itemsById, fefoLotByItemId);
  };

  const handleSaveAssignment = (date: string, values: MealSlotAssignmentValues) => {
    upsertMealPlan.mutate(
      { planned_date: date, recipe_id: values.recipe_id, note: values.note },
      { onSuccess: () => setEditingDate(null) },
    );
  };

  const handleUnassign = (date: string) => {
    upsertMealPlan.mutate({ planned_date: date, recipe_id: null, note: null });
  };

  const handleAssignRecommended = (date: string, recipeId: string) => {
    upsertMealPlan.mutate({ planned_date: date, recipe_id: recipeId, note: null });
  };

  const handleAddMissingToShoppingList = async (date: string, shortages: RecipeShortage[]) => {
    setAddingShoppingListDate(date);
    let succeeded = 0;
    let failed = 0;
    for (const shortage of shortages) {
      try {
        await upsertShoppingItem.mutateAsync(shortageToShoppingItemInput(shortage));
        succeeded += 1;
      } catch {
        failed += 1;
      }
    }
    setAddingShoppingListDate(null);
    if (failed === 0) {
      toast(t("addedToShoppingList", { count: succeeded }), "success");
    } else {
      toast(t("addToShoppingListPartialFailure", { succeeded, failed }), "warning");
    }
  };

  const runExecute = async (
    date: string,
    mealPlanId: string,
    recipe: RecipeWithItems,
    force: boolean,
  ) => {
    setExecutingDate(date);
    try {
      const result = await executeMealPlan.mutateAsync({ mealPlanId, recipe, itemsById, force });
      if (result.status === "blocked") {
        setPendingExecution({ date, mealPlanId, recipe, shortages: result.shortages });
        return;
      }
      setPendingExecution(null);
      if (result.failedItemIds.length > 0) {
        toast(t("executeFailed", { count: result.failedItemIds.length }), "warning");
      } else {
        toast(t("executeSuccess"), "success");
      }
    } catch {
      // Error toast is handled by useExecuteMealPlan.onError
    } finally {
      setExecutingDate(null);
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive p-4 text-sm text-destructive">
        {t("loadError")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {slots.map(({ date, plan }) => (
          <MealSlot
            key={date}
            date={date}
            isToday={date === today}
            plan={plan}
            isEditing={editingDate === date}
            availableRecipes={recipes}
            isSaving={upsertMealPlan.isPending}
            stockCheck={stockCheckFor(plan)}
            isAddingToShoppingList={addingShoppingListDate === date}
            isExecuting={executingDate === date}
            recommendation={
              plan ? null : { internalCandidates, externalSuggestions, isLoadingExternal }
            }
            onStartEdit={() => setEditingDate(date)}
            onCancelEdit={() => setEditingDate(null)}
            onSaveAssignment={(values) => handleSaveAssignment(date, values)}
            onUnassign={() => handleUnassign(date)}
            onAddMissingToShoppingList={() =>
              void handleAddMissingToShoppingList(date, stockCheckFor(plan)?.shortages ?? [])
            }
            onExecute={() => {
              if (!plan?.id || !plan.recipe) return;
              void runExecute(date, plan.id, plan.recipe, false);
            }}
            onAssignRecommendedRecipe={(recipeId) => handleAssignRecommended(date, recipeId)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={pendingExecution !== null}
        title={t("stockShortageTitle")}
        message={t("stockShortageMessage")}
        confirmLabel={t("executeAnyway")}
        variant="default"
        isConfirming={executingDate === pendingExecution?.date}
        onConfirm={() => {
          if (!pendingExecution) return;
          void runExecute(
            pendingExecution.date,
            pendingExecution.mealPlanId,
            pendingExecution.recipe,
            true,
          );
        }}
        onCancel={() => setPendingExecution(null)}
      />
    </div>
  );
};
