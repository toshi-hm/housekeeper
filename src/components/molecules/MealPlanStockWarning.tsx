import { CheckCircle2, ShoppingCart } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import type { RecipeShortage } from "@/types/recipe";

interface MealPlanStockWarningProps {
  shortages: RecipeShortage[];
  isAdding?: boolean;
  onAddMissingToShoppingList: () => void;
}

/** 不足食材一覧 + 「買い物リストに追加」ボタン（`_auth.recipes.tsx` の在庫不足表示を
 *  踏襲・再利用、meal-plan.md「画面」節）。在庫が足りている場合は静かに「不足なし」
 *  を示すだけにする。 */
export const MealPlanStockWarning = ({
  shortages,
  isAdding = false,
  onAddMissingToShoppingList,
}: MealPlanStockWarningProps) => {
  const { t } = useTranslation("mealPlan");

  if (shortages.length === 0) {
    return (
      <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        {t("stockOk")}
      </p>
    );
  }

  return (
    <div className="space-y-1.5 rounded-md border border-orange-300 bg-orange-50 p-2 text-orange-800 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200">
      <p className="text-xs font-medium">{t("stockShortageTitle")}</p>
      <p className="text-xs">{t("stockShortageMessage")}</p>
      <ul className="list-inside list-disc text-xs">
        {shortages.map((shortage) => (
          <li key={shortage.item_id}>
            {shortage.item_name} —{" "}
            {t("stockShortageAmount", {
              required: shortage.required,
              available: shortage.available,
              unit: shortage.unit,
            })}
          </li>
        ))}
      </ul>
      <Button
        size="sm"
        variant="outline"
        className="border-orange-400 bg-orange-50 text-orange-800 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-200"
        disabled={isAdding}
        onClick={onAddMissingToShoppingList}
      >
        <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
        {t("addMissingToShoppingList")}
      </Button>
    </div>
  );
};
