import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { LOTS_KEY } from "@/hooks/useItemLots";
import { executeRecipe, type ExecuteRecipeResult, useRecipes } from "@/hooks/useRecipes";
import { OfflineError, requireOnline } from "@/lib/requireOnline";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/lib/toast-context";
import type { Item } from "@/types/item";
import {
  hasMealPlanAssignment,
  type MealPlan,
  type MealPlanSlot,
  type MealPlanWithRecipe,
  type UpsertMealPlanInput,
} from "@/types/mealPlan";
import type { RecipeShortage, RecipeWithItems } from "@/types/recipe";
import type { UpsertShoppingItemInput } from "@/types/shopping";

const MEAL_PLANS_KEY = ["meal-plans"] as const;

const fetchMealPlans = async (range: readonly string[]): Promise<MealPlan[]> => {
  if (range.length === 0) return [];
  const start = range[0] as string;
  const end = range[range.length - 1] as string;
  const { data, error } = await supabase
    .from("meal_plans")
    .select("*")
    .gte("planned_date", start)
    .lte("planned_date", end);
  if (error) throw new Error(error.message);
  return (data ?? []) as MealPlan[];
};

/**
 * 向こう7日分の `meal_plans` を取得し、`recipe_id` を `useRecipes()` の
 * キャッシュとクライアント側で join した `MealPlanSlot[]`（レンジ全日分、
 * 未割当日は `plan: null`）を返す。専用のPostgres joinではなく既存の
 * `useRecipes()` キャッシュを再利用することで新規リクエストを増やさない
 * （meal-plan.md「API」節）。
 */
export const useMealPlans = (range: readonly string[]) => {
  const recipesQuery = useRecipes();
  const recipes = recipesQuery.data ?? [];
  const query = useQuery({
    queryKey: [...MEAL_PLANS_KEY, range[0], range[range.length - 1]],
    queryFn: () => fetchMealPlans(range),
    enabled: range.length > 0,
    staleTime: 30_000,
  });

  const recipesById = Object.fromEntries(recipes.map((r) => [r.id, r]));
  const plansByDate = new Map(query.data?.map((plan) => [plan.planned_date, plan]));

  const slots: MealPlanSlot[] = range.map((date) => {
    const plan = plansByDate.get(date);
    if (!plan) return { date, plan: null };
    const withRecipe: MealPlanWithRecipe = {
      ...plan,
      recipe: plan.recipe_id ? (recipesById[plan.recipe_id] ?? null) : null,
    };
    return { date, plan: withRecipe };
  });

  // recipesQuery が読み込み中のまま meal_plans だけ先に返ると、既にレシピが
  // 割り当てられている枠の recipe が一時的に解決できず(recipesById が空)、
  // 空き枠のUI(レコメンド付き)へ一瞬フォールバックしてしまう(#715 セルフレビュー)。
  return { ...query, isLoading: query.isLoading || recipesQuery.isLoading, slots };
};

/** `useUpsertMealPlan` の実処理。単体テストのため素の関数として切り出している。 */
export const upsertMealPlan = async (input: UpsertMealPlanInput): Promise<MealPlan | null> => {
  requireOnline();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // recipe_id も note も無い = 割当解除。両方nullのupsertを許すのではなく、
  // 行自体を削除する（meal-plan.md「バリデーション」節）。
  if (!hasMealPlanAssignment(input)) {
    const { error } = await supabase
      .from("meal_plans")
      .delete()
      .eq("user_id", user.id)
      .eq("planned_date", input.planned_date);
    if (error) throw new Error(error.message);
    return null;
  }

  const { data, error } = await supabase
    .from("meal_plans")
    .upsert(
      {
        user_id: user.id,
        planned_date: input.planned_date,
        recipe_id: input.recipe_id ?? null,
        note: input.note ?? null,
      },
      { onConflict: "user_id,planned_date" },
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MealPlan;
};

export const useUpsertMealPlan = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: upsertMealPlan,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: MEAL_PLANS_KEY });
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};

interface ExecuteMealPlanParams {
  mealPlanId: string;
  recipe: RecipeWithItems;
  itemsById: Record<string, Item | undefined>;
  force?: boolean;
}

/**
 * 「実行」操作。既存 `executeRecipe`（`useRecipes.ts`）をそのまま呼び、
 * 実際に何かしら消費できた場合のみ `meal_plans.executed_at` を更新する薄い
 * ラッパー（meal-plan.md「実行」節）。新しい消費ロジックは書かない。
 */
export const executeMealPlan = async ({
  mealPlanId,
  recipe,
  itemsById,
  force = false,
}: ExecuteMealPlanParams): Promise<ExecuteRecipeResult> => {
  const result = await executeRecipe({ recipe, itemsById, force });
  if (result.status === "executed" && result.consumedItemIds.length > 0) {
    const { error } = await supabase
      .from("meal_plans")
      .update({ executed_at: new Date().toISOString() })
      .eq("id", mealPlanId);
    if (error) throw new Error(error.message);
  }
  return result;
};

export const useExecuteMealPlan = () => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { t } = useTranslation("common");
  return useMutation({
    mutationFn: executeMealPlan,
    onSuccess: async (result) => {
      if (result.consumedItemIds.length === 0) return;
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["items"] }),
        qc.invalidateQueries({ queryKey: LOTS_KEY }),
        qc.invalidateQueries({ queryKey: ["consumption-logs-all"] }),
        ...result.consumedItemIds.map((itemId) =>
          qc.invalidateQueries({ queryKey: ["consumption-logs", itemId] }),
        ),
        // レシピ実行と同様、auto_reorder で買い物リストに自動追加されることが
        // あるため invalidate する (useExecuteRecipe と同じ方針)。
        qc.invalidateQueries({ queryKey: ["shopping"] }),
        qc.invalidateQueries({ queryKey: MEAL_PLANS_KEY }),
      ]);
      if (result.logInsertFailed) toast(t("consumptionLogFailed"), "warning");
    },
    onError: (error) => {
      if (error instanceof OfflineError) toast(t("offlineError"), "error");
      else toast(t("unknownError"), "error");
    },
  });
};

/**
 * `checkRecipeStock` が返す不足（`RecipeShortage`）1件を、買い物リストへの
 * 追加入力に変換する。`desired_units` は既存のダッシュボード「不足分を買い物
 * リストに追加」（`_auth.index.tsx` の `handleBulkAddToShopping`）と同じく、
 * 内容量ベースの不足分を個数へ換算する仕組みが無いため固定で1とする。
 */
export const shortageToShoppingItemInput = (shortage: RecipeShortage): UpsertShoppingItemInput => ({
  name: shortage.item_name,
  linked_item_id: shortage.item_id,
  desired_units: 1,
});
