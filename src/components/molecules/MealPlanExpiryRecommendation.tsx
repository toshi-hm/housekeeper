import { useTranslation } from "react-i18next";

import { ExpiryRecipeSuggestions } from "@/components/molecules/ExpiryRecipeSuggestions";
import { Button } from "@/components/ui/button";
import type { RecipeSuggestion } from "@/hooks/useRecipeSuggestions";
import type { RecipeExpiryScore } from "@/types/recipe";

interface MealPlanExpiryRecommendationProps {
  /** 内部レシピ候補（`rankRecipesByExpiringStock`、既にスコア降順） */
  internalCandidates: RecipeExpiryScore[];
  /** 内部候補が無い/少ない場合のフォールバック（外部レシピ、`useRecipeSuggestions`） */
  externalSuggestions: RecipeSuggestion[];
  isLoadingExternal: boolean;
  onAssignRecipe: (recipeId: string) => void;
}

/**
 * 空き枠向けレコメンド。2段構成（meal-plan.md「空き枠のレコメンド」節）:
 * 1. 内部レシピ候補があれば「一致するレシピ」として一覧 + 割当ボタン
 * 2. 無ければ外部レシピ候補を `ExpiryRecipeSuggestions` と同等の見た目で
 *    アイデアとして提示する（そのまま再利用、ワンタップ割当は不可）
 * 両方空なら何も描画しない（`ExpiryRecipeSuggestions` と同じ静かな degrade 方針）。
 */
export const MealPlanExpiryRecommendation = ({
  internalCandidates,
  externalSuggestions,
  isLoadingExternal,
  onAssignRecipe,
}: MealPlanExpiryRecommendationProps) => {
  const { t } = useTranslation("mealPlan");

  if (internalCandidates.length === 0 && externalSuggestions.length === 0 && !isLoadingExternal) {
    return null;
  }

  if (internalCandidates.length > 0) {
    return (
      <div className="space-y-1.5 rounded-md border border-emerald-200 bg-emerald-50 p-2 dark:border-emerald-800 dark:bg-emerald-950/30">
        <p className="text-xs font-medium text-emerald-900 dark:text-emerald-100">
          {t("recommendationTitle")}
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {internalCandidates.map(({ recipe }) => (
            <li key={recipe.id}>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-auto border-emerald-300 bg-white px-2 py-1 text-xs text-emerald-900 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-100"
                onClick={() => onAssignRecipe(recipe.id)}
              >
                {recipe.name}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-emerald-900 dark:text-emerald-100">
        {t("recommendationIdeasTitle")}
      </p>
      <ExpiryRecipeSuggestions isLoading={isLoadingExternal} suggestions={externalSuggestions} />
    </div>
  );
};
