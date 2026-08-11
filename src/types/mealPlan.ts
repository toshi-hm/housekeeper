import { toLocalDateKey } from "@/lib/dateUtils";
import type { RecipeWithItems } from "@/types/recipe";

export const MEAL_PLAN_NOTE_MAX_LENGTH = 200;

/** 週間献立プランナーの1枠（`meal_plans` 1行）。#715, docs/specs/features/meal-plan.md 参照。 */
export interface MealPlan {
  id: string;
  user_id: string;
  /** YYYY-MM-DD */
  planned_date: string;
  recipe_id: string | null;
  note: string | null;
  executed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** `useMealPlans` がクライアント側で `recipes` と join した結果 */
export interface MealPlanWithRecipe extends MealPlan {
  recipe: RecipeWithItems | null;
}

export interface UpsertMealPlanInput {
  planned_date: string;
  recipe_id?: string | null;
  note?: string | null;
}

/** `planned_date` に対して既存の枠を割り当てるための1日分のスロット表現。
 *  `meal_plans` に対応する行が無い日は `plan: null` で表す（空き枠）。 */
export interface MealPlanSlot {
  date: string;
  plan: MealPlanWithRecipe | null;
}

/**
 * `recipe_id` と `note` の少なくとも一方が必須というバリデーション
 * （両方 null/空 = 未割当を意味する。meal-plan.md「バリデーション」節）。
 */
export const hasMealPlanAssignment = (
  input: Pick<UpsertMealPlanInput, "recipe_id" | "note">,
): boolean => Boolean(input.recipe_id) || Boolean(input.note?.trim());

/**
 * 今日を含む向こう7日分の日付（YYYY-MM-DD、ローカルタイムゾーン基準）を返す。
 * `getExpiryStatus` 等と同じく `new Date()` をローカル日付として扱う既存の
 * 日付処理方針に揃える。
 */
export const buildWeekRange = (today: Date = new Date()): string[] => {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toLocalDateKey(d);
  });
};
