import { Check, Pencil, Play, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
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

/** 割当済み枠（レシピ/メモどちらも）で共通の「変更」「割り当て解除」ボタン対 */
const SlotEditActions = ({
  onStartEdit,
  onUnassign,
}: {
  onStartEdit: () => void;
  onUnassign: () => void;
}) => {
  const { t } = useTranslation("mealPlan");
  return (
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
  );
};

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

  // 実行済み（executed_at セット済み）枠は、消費実績（item_lots/consumption_logs）が
  // 既に反映されている。確認なしに解除・変更させると、実行記録だけが消費実績と
  // 食い違ったまま残ってしまう（#872）ため、実行済み枠の解除・変更操作にのみ
  // 確認ダイアログを挟む。未実行の枠は従来通り即時実行する。
  const [pendingGuardedAction, setPendingGuardedAction] = useState<"unassign" | "edit" | null>(
    null,
  );
  const isExecuted = !!plan?.executed_at;
  const handleUnassign = () => {
    if (isExecuted) {
      setPendingGuardedAction("unassign");
      return;
    }
    onUnassign();
  };
  const handleStartEdit = () => {
    if (isExecuted) {
      setPendingGuardedAction("edit");
      return;
    }
    onStartEdit();
  };
  const confirmGuardedAction = () => {
    if (pendingGuardedAction === "unassign") onUnassign();
    else if (pendingGuardedAction === "edit") onStartEdit();
    setPendingGuardedAction(null);
  };

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
            <SlotEditActions onStartEdit={handleStartEdit} onUnassign={handleUnassign} />
          </div>
          <MealPlanStockWarning
            shortages={stockCheck?.shortages ?? []}
            isAdding={isAddingToShoppingList}
            onAddMissingToShoppingList={onAddMissingToShoppingList}
          />
          <Button
            size="sm"
            className="w-full"
            disabled={isExecuting || !!plan.executed_at}
            onClick={onExecute}
          >
            <Play className="mr-1.5 h-3.5 w-3.5" />
            {isExecuting ? t("executing") : t("execute")}
          </Button>
        </div>
      ) : plan?.note ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-sm">{plan.note}</p>
            <SlotEditActions onStartEdit={handleStartEdit} onUnassign={handleUnassign} />
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

      <ConfirmDialog
        open={pendingGuardedAction !== null}
        title={t("executedGuardTitle")}
        message={t("executedGuardMessage")}
        confirmLabel={pendingGuardedAction === "unassign" ? t("unassign") : t("changeRecipe")}
        onConfirm={confirmGuardedAction}
        onCancel={() => setPendingGuardedAction(null)}
      />
    </div>
  );
};
