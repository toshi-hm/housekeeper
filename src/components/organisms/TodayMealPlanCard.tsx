import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, Check, Play } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/atoms/Skeleton";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { MealPlanStockWarning } from "@/components/molecules/MealPlanStockWarning";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LOTS_KEY } from "@/hooks/useItemLots";
import { useItems } from "@/hooks/useItems";
import { useCategories } from "@/hooks/useMasterData";
import {
  shortageToShoppingItemInput,
  useExecuteMealPlan,
  useMealPlans,
} from "@/hooks/useMealPlans";
import { fetchFefoLotByItemId } from "@/hooks/useRecipes";
import { useUpsertShoppingItem } from "@/hooks/useShoppingList";
import { toLocalDateKey } from "@/lib/dateUtils";
import { useToast } from "@/lib/toast-context";
import { dropExpiryForDailyGoods } from "@/types/item";
import { checkRecipeStock, type RecipeShortage } from "@/types/recipe";

/**
 * ダッシュボードに常時表示する「今日の献立」ミニカード（#1035）。週間献立
 * プランナー（`WeeklyMealPlanner`/`MealSlot`）と同じhook・在庫確認・実行・
 * 買い物リスト追加ロジックを、今日1日分だけに絞って再利用する薄いラッパー。
 * 新しい消費・在庫確認ロジックは書かない（meal-plan.md 方針）。
 *
 * `WeeklyMealPlanner`とは異なりレシピの割当編集（`MealSlotRecipePicker`）は
 * 持たない — 割当変更は `/meal-plan` に委ね、このカードは「今日実行する」
 * 「不足分を買い物リストへ」というダッシュボードでの日常動線のみを担う。
 */
export const TodayMealPlanCard = () => {
  const { t } = useTranslation("mealPlan");
  const { toast } = useToast();
  const today = toLocalDateKey(new Date());

  const { data: rawItems = [] } = useItems();
  const { data: categories = [] } = useCategories();
  const { slots, isLoading, error } = useMealPlans([today]);
  const executeMealPlan = useExecuteMealPlan();
  const upsertShoppingItem = useUpsertShoppingItem();

  // #1073: 他画面と同じく、カテゴリを日用品へ切り替えた既存アイテムに残った
  // expiry_date を無視してから在庫確認に使う。
  const categoryById = Object.fromEntries(categories.map((c) => [c.id, c]));
  const items = dropExpiryForDailyGoods(rawItems, categoryById);
  const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));

  const [isAddingToShoppingList, setIsAddingToShoppingList] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [pendingShortages, setPendingShortages] = useState<RecipeShortage[] | null>(null);

  const plan = slots[0]?.plan ?? null;
  const recipe = plan?.recipe ?? null;

  const stockCheckItemIds = recipe ? [...new Set(recipe.items.map((i) => i.item_id))].sort() : [];
  // `LOTS_KEY` を接頭辞にすることで、`useExecuteMealPlan` 成功時のinvalidate
  // （queryKey: LOTS_KEY）がこのクエリも対象にする（`WeeklyMealPlanner`と同じ方針）。
  const { data: fefoLotByItemId = {} } = useQuery({
    queryKey: [...LOTS_KEY, "today-meal-plan-fefo", stockCheckItemIds],
    queryFn: () => fetchFefoLotByItemId(stockCheckItemIds),
    enabled: stockCheckItemIds.length > 0,
    staleTime: 30_000,
  });

  const stockCheck = recipe ? checkRecipeStock(recipe.items, itemsById, fefoLotByItemId) : null;

  const handleAddMissingToShoppingList = async (shortages: RecipeShortage[]) => {
    setIsAddingToShoppingList(true);
    // ベストエフォート方針（`WeeklyMealPlanner`と同じ）: 1件の失敗が他の追加を
    // ブロックしないよう並列実行する。
    const results = await Promise.allSettled(
      shortages.map((shortage) =>
        upsertShoppingItem.mutateAsync(shortageToShoppingItemInput(shortage)),
      ),
    );
    const succeeded = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;
    setIsAddingToShoppingList(false);
    if (failed === 0) {
      toast(t("addedToShoppingList", { count: succeeded }), "success");
    } else {
      toast(t("addToShoppingListPartialFailure", { succeeded, failed }), "warning");
    }
  };

  const runExecute = async (force: boolean) => {
    if (!plan?.id || !recipe) return;
    setIsExecuting(true);
    try {
      const result = await executeMealPlan.mutateAsync({
        mealPlanId: plan.id,
        recipe,
        itemsById,
        force,
      });
      if (result.status === "blocked") {
        setPendingShortages(result.shortages);
        return;
      }
      setPendingShortages(null);
      if (result.failedItemIds.length > 0) {
        toast(t("executeFailed", { count: result.failedItemIds.length }), "warning");
      } else {
        toast(t("executeSuccess"), "success");
      }
    } catch {
      // Error toast is handled by useExecuteMealPlan.onError
    } finally {
      setIsExecuting(false);
    }
  };

  if (isLoading) return <Skeleton className="h-28 w-full rounded-lg" />;

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-destructive p-3 text-sm text-destructive"
      >
        {t("loadError")}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
          {t("todayCardTitle")}
        </div>
        <Link
          to="/meal-plan"
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {t("todayCardViewWeek")}
        </Link>
      </div>

      {recipe ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate font-medium">{recipe.name}</p>
            {plan?.executed_at && (
              <Badge variant="secondary" className="shrink-0 gap-1">
                <Check className="h-3 w-3" />
                {t("executedAt")}
              </Badge>
            )}
          </div>
          <MealPlanStockWarning
            shortages={stockCheck?.shortages ?? []}
            isAdding={isAddingToShoppingList}
            onAddMissingToShoppingList={() =>
              void handleAddMissingToShoppingList(stockCheck?.shortages ?? [])
            }
          />
          <Button
            size="sm"
            className="w-full"
            disabled={isExecuting || !!plan?.executed_at}
            onClick={() => void runExecute(false)}
          >
            <Play className="mr-1.5 h-3.5 w-3.5" />
            {isExecuting ? t("executing") : t("execute")}
          </Button>
        </div>
      ) : plan?.note ? (
        <p className="truncate text-sm text-muted-foreground">{plan.note}</p>
      ) : (
        <Link
          to="/meal-plan"
          className="block rounded-md border border-dashed p-2 text-center text-sm text-muted-foreground hover:bg-muted"
        >
          {t("todayCardEmpty")}
        </Link>
      )}

      <ConfirmDialog
        open={pendingShortages !== null}
        title={t("stockShortageTitle")}
        message={t("stockShortageMessage")}
        confirmLabel={t("executeAnyway")}
        variant="default"
        isConfirming={isExecuting}
        onConfirm={() => void runExecute(true)}
        onCancel={() => setPendingShortages(null)}
      />
    </div>
  );
};
