import { Check, Pencil, Play, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MealPlanExpiryRecommendation } from "@/components/molecules/MealPlanExpiryRecommendation";
import { MealPlanStockWarning } from "@/components/molecules/MealPlanStockWarning";
import {
  type MealSlotAssignmentValues,
  MealSlotRecipePicker,
} from "@/components/molecules/MealSlotRecipePicker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RecipeSuggestion } from "@/hooks/useRecipeSuggestions";
import { parseLocalDate } from "@/lib/dateUtils";
import type { MealPlanWithRecipe } from "@/types/mealPlan";
import type { RecipeExpiryScore, RecipeStockCheckResult, RecipeWithItems } from "@/types/recipe";

interface MealSlotRecommendation {
  internalCandidates: RecipeExpiryScore[];
  externalSuggestions: RecipeSuggestion[];
  isLoadingExternal: boolean;
}

interface MealSlotProps {
  /** YYYY-MM-DD */
  date: string;
  isToday: boolean;
  plan: MealPlanWithRecipe | null;
  isEditing: boolean;
  availableRecipes: Pick<RecipeWithItems, "id" | "name">[];
  isSaving?: boolean;
  /** 割当レシピの在庫確認結果。レシピ未割当/未確認なら null */
  stockCheck: RecipeStockCheckResult | null;
  isAddingToShoppingList?: boolean;
  isExecuting?: boolean;
  /** 空き枠向けレコメンド。割当済みの枠では null */
  recommendation: MealSlotRecommendation | null;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveAssignment: (values: MealSlotAssignmentValues) => void;
  onUnassign: () => void;
  onAddMissingToShoppingList: () => void;
  onExecute: () => void;
  onAssignRecommendedRecipe: (recipeId: string) => void;
}

/** 1日分の献立枠。日付表示・割当レシピ or メモの表示・空き枠時のレコメンド表示・
 *  アクションボタン群を組む（meal-plan.md「画面」節）。Supabase呼び出しは行わず、
 *  すべて `WeeklyMealPlanner` から渡されるデータとコールバックのみで動作する。 */
export const MealSlot = ({
  date,
  isToday,
  plan,
  isEditing,
  availableRecipes,
  isSaving = false,
  stockCheck,
  isAddingToShoppingList = false,
  isExecuting = false,
  recommendation,
  onStartEdit,
  onCancelEdit,
  onSaveAssignment,
  onUnassign,
  onAddMissingToShoppingList,
  onExecute,
  onAssignRecommendedRecipe,
}: MealSlotProps) => {
  const { t, i18n } = useTranslation("mealPlan");
  const dateLabel = parseLocalDate(date).toLocaleDateString(i18n.language, {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });

  return (
    <div
      className={`space-y-2 rounded-lg border p-3 ${isToday ? "border-primary ring-1 ring-primary" : ""}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{dateLabel}</p>
        {plan?.executed_at && (
          <Badge variant="secondary" className="gap-1">
            <Check className="h-3 w-3" />
            {t("executedAt")}
          </Badge>
        )}
      </div>

      {isEditing ? (
        <MealSlotRecipePicker
          availableRecipes={availableRecipes}
          initialRecipeId={plan?.recipe_id}
          initialNote={plan?.note}
          isSubmitting={isSaving}
          onSubmit={onSaveAssignment}
          onCancel={onCancelEdit}
        />
      ) : plan?.recipe ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate font-medium">{plan.recipe.name}</p>
            <div className="flex shrink-0 gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label={t("changeRecipe")}
                onClick={onStartEdit}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label={t("unassign")}
                onClick={onUnassign}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <MealPlanStockWarning
            shortages={stockCheck?.shortages ?? []}
            isAdding={isAddingToShoppingList}
            onAddMissingToShoppingList={onAddMissingToShoppingList}
          />
          <Button size="sm" className="w-full" disabled={isExecuting} onClick={onExecute}>
            <Play className="mr-1.5 h-3.5 w-3.5" />
            {isExecuting ? t("executing") : t("execute")}
          </Button>
        </div>
      ) : plan?.note ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm">{plan.note}</p>
            <div className="flex shrink-0 gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label={t("changeRecipe")}
                onClick={onStartEdit}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label={t("unassign")}
                onClick={onUnassign}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={onStartEdit}
            className="w-full rounded-md border border-dashed p-2 text-center text-sm text-muted-foreground hover:bg-muted"
          >
            {t("emptySlot")}
          </button>
          {recommendation && (
            <MealPlanExpiryRecommendation
              internalCandidates={recommendation.internalCandidates}
              externalSuggestions={recommendation.externalSuggestions}
              isLoadingExternal={recommendation.isLoadingExternal}
              onAssignRecipe={onAssignRecommendedRecipe}
            />
          )}
        </div>
      )}
    </div>
  );
};
