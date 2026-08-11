import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MEAL_PLAN_NOTE_MAX_LENGTH } from "@/types/mealPlan";
import type { RecipeWithItems } from "@/types/recipe";

export interface MealSlotAssignmentValues {
  recipe_id: string | null;
  note: string | null;
}

interface MealSlotRecipePickerProps {
  /** 選択肢として表示する登録済みレシピ一覧 */
  availableRecipes: Pick<RecipeWithItems, "id" | "name">[];
  initialRecipeId?: string | null;
  initialNote?: string | null;
  isSubmitting?: boolean;
  onSubmit: (values: MealSlotAssignmentValues) => void;
  onCancel: () => void;
}

/**
 * 既存 `recipes` から1件選ぶ Select と自由記述メモの切替UI（`RecipeForm` の
 * アイテム選択UIを踏襲、meal-plan.md「画面」節）。レシピモードとメモモードは
 * 排他（`recipe_id`/`note` の少なくとも一方が必須、両方が同時に入ることはない）。
 */
export const MealSlotRecipePicker = ({
  availableRecipes,
  initialRecipeId,
  initialNote,
  isSubmitting = false,
  onSubmit,
  onCancel,
}: MealSlotRecipePickerProps) => {
  const { t } = useTranslation("mealPlan");
  const { t: tc } = useTranslation("common");
  const [mode, setMode] = useState<"recipe" | "note">(
    !initialRecipeId && initialNote ? "note" : "recipe",
  );
  const [recipeId, setRecipeId] = useState(initialRecipeId ?? availableRecipes[0]?.id ?? "");
  const [note, setNote] = useState(initialNote ?? "");

  const canSubmit =
    !isSubmitting && (mode === "recipe" ? recipeId.length > 0 : note.trim().length > 0);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(
      mode === "recipe"
        ? { recipe_id: recipeId, note: null }
        : { recipe_id: null, note: note.trim() },
    );
  };

  return (
    <div className="space-y-2 rounded-md border p-2">
      <div className="flex gap-1">
        <Button
          type="button"
          size="sm"
          variant={mode === "recipe" ? "default" : "outline"}
          className="flex-1"
          onClick={() => setMode("recipe")}
          disabled={availableRecipes.length === 0}
        >
          {t("assignRecipe")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "note" ? "default" : "outline"}
          className="flex-1"
          onClick={() => setMode("note")}
        >
          {t("noteOnly")}
        </Button>
      </div>

      {mode === "recipe" ? (
        availableRecipes.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("noAvailableRecipes")}</p>
        ) : (
          <Select
            value={recipeId}
            onChange={(e) => setRecipeId(e.target.value)}
            aria-label={t("assignRecipe")}
          >
            {availableRecipes.map((recipe) => (
              <option key={recipe.id} value={recipe.id}>
                {recipe.name}
              </option>
            ))}
          </Select>
        )
      ) : (
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("notePlaceholder")}
          maxLength={MEAL_PLAN_NOTE_MAX_LENGTH}
          aria-label={t("noteOnly")}
        />
      )}

      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={handleSubmit} disabled={!canSubmit}>
          {tc("save")}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          {tc("cancel")}
        </Button>
      </div>
    </div>
  );
};
