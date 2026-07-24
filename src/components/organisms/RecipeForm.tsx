import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import type { Item } from "@/types/item";
import type { RecipeFormValues, RecipeItemInput } from "@/types/recipe";

interface RecipeFormProps {
  /** 選択肢として表示する在庫アイテム一覧 */
  availableItems: Pick<Item, "id" | "name" | "content_unit">[];
  defaultValues?: RecipeFormValues;
  onSubmit: (values: RecipeFormValues) => void;
  onCancel: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
}

const emptyRow = (defaultItemId: string): RecipeItemInput => ({
  item_id: defaultItemId,
  amount: 1,
});

export const RecipeForm = ({
  availableItems,
  defaultValues,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitLabel,
}: RecipeFormProps) => {
  const { t } = useTranslation("recipes");
  const { t: tc } = useTranslation("common");
  const firstItemId = availableItems[0]?.id ?? "";

  const [name, setName] = useState(defaultValues?.name ?? "");
  const [rows, setRows] = useState<RecipeItemInput[]>(
    defaultValues && defaultValues.items.length > 0 ? defaultValues.items : [emptyRow(firstItemId)],
  );

  const itemUnit = (itemId: string) =>
    availableItems.find((i) => i.id === itemId)?.content_unit ?? "";

  const updateRow = (index: number, patch: Partial<RecipeItemInput>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const validRows = rows.filter((row) => row.item_id && row.amount > 0);
  const canSubmit = name.trim().length > 0 && validRows.length > 0 && !isSubmitting;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit({ name: name.trim(), items: validRows });
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1">
        <Label htmlFor="recipe-name">{t("recipeName")}</Label>
        <Input
          id="recipe-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("recipeNamePlaceholder")}
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <Label>{t("recipeItems")}</Label>
        {availableItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noAvailableItems")}</p>
        ) : (
          <>
            {rows.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <Select
                  value={row.item_id}
                  onChange={(e) => updateRow(index, { item_id: e.target.value })}
                  className="flex-1"
                  aria-label={t("recipeItemSelect")}
                >
                  {availableItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={row.amount}
                  onChange={(e) =>
                    updateRow(index, { amount: Math.max(0, Number(e.target.value) || 0) })
                  }
                  className="w-20"
                  aria-label={t("recipeItemAmount")}
                />
                <span className="w-10 shrink-0 text-xs text-muted-foreground">
                  {itemUnit(row.item_id)}
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  aria-label={t("recipeRemoveRow")}
                  onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                  disabled={rows.length === 1}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setRows((prev) => [...prev, emptyRow(firstItemId)])}
            >
              <Plus className="mr-1 h-4 w-4" />
              {t("recipeAddRow")}
            </Button>
          </>
        )}
      </div>

      <div className="flex gap-2">
        <Button className="flex-1" onClick={handleSubmit} disabled={!canSubmit}>
          {submitLabel ?? tc("save")}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
          {tc("cancel")}
        </Button>
      </div>
    </div>
  );
};
