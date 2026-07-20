import { createFileRoute } from "@tanstack/react-router";
import { ChefHat, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/atoms/Skeleton";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { RecipeForm } from "@/components/organisms/RecipeForm";
import { Button } from "@/components/ui/button";
import { useItems } from "@/hooks/useItems";
import {
  type ExecuteRecipeResult,
  useDeleteRecipe,
  useExecuteRecipe,
  useRecipes,
  useSaveRecipe,
} from "@/hooks/useRecipes";
import { useToast } from "@/lib/toast-context";
import type { RecipeFormValues, RecipeShortage, RecipeWithItems } from "@/types/recipe";

type EditorState = { mode: "closed" } | { mode: "new" } | { mode: "edit"; recipe: RecipeWithItems };

interface PendingExecution {
  recipe: RecipeWithItems;
  shortages: RecipeShortage[];
}

const RecipesPage = () => {
  const { t } = useTranslation("recipes");
  const { t: tc } = useTranslation("common");
  const { toast } = useToast();

  const { data: recipes = [], isLoading, error } = useRecipes();
  const { data: items = [] } = useItems();
  const saveRecipe = useSaveRecipe();
  const deleteRecipe = useDeleteRecipe();
  const executeRecipe = useExecuteRecipe();

  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [pendingExecution, setPendingExecution] = useState<PendingExecution | null>(null);

  const itemsById = Object.fromEntries(items.map((item) => [item.id, item]));

  const handleSave = (values: RecipeFormValues) => {
    const id = editor.mode === "edit" ? editor.recipe.id : undefined;
    saveRecipe.mutate(
      { id, name: values.name, items: values.items },
      {
        onSuccess: () => {
          toast(t("saved"), "success");
          setEditor({ mode: "closed" });
        },
      },
    );
  };

  const handleDelete = () => {
    if (!deleteTargetId) return;
    const id = deleteTargetId;
    deleteRecipe.mutate(id, {
      onSuccess: () => {
        toast(t("deleted"), "success");
        setDeleteTargetId(null);
      },
    });
  };

  const notifyExecuteResult = (result: ExecuteRecipeResult) => {
    if (result.failedItemIds.length > 0) {
      toast(t("executedFailed", { count: result.failedItemIds.length }), "warning");
    } else if (result.skippedItemIds.length > 0) {
      toast(
        t("executedPartial", {
          consumed: result.consumedItemIds.length,
          skipped: result.skippedItemIds.length,
        }),
        "success",
      );
    } else {
      toast(t("executedSuccess", { count: result.consumedItemIds.length }), "success");
    }
  };

  const runExecute = async (recipe: RecipeWithItems, force: boolean) => {
    setExecutingId(recipe.id);
    try {
      const result = await executeRecipe.mutateAsync({ recipe, itemsById, force });
      if (result.status === "blocked") {
        setPendingExecution({ recipe, shortages: result.shortages });
        return;
      }
      setPendingExecution(null);
      notifyExecuteResult(result);
    } catch {
      // Error toast is handled by useExecuteRecipe.onError
    } finally {
      setExecutingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ChefHat className="h-6 w-6" />
          <div>
            <h1 className="text-2xl font-bold">{t("title")}</h1>
            <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          </div>
        </div>
        {editor.mode === "closed" && (
          <Button size="sm" onClick={() => setEditor({ mode: "new" })}>
            <Plus className="mr-1 h-4 w-4" />
            {t("createRecipe")}
          </Button>
        )}
      </div>

      {editor.mode !== "closed" && (
        <RecipeForm
          availableItems={items}
          defaultValues={
            editor.mode === "edit"
              ? {
                  name: editor.recipe.name,
                  items: editor.recipe.items.map((i) => ({ item_id: i.item_id, amount: i.amount })),
                }
              : undefined
          }
          submitLabel={editor.mode === "edit" ? tc("save") : t("createRecipe")}
          isSubmitting={saveRecipe.isPending}
          onSubmit={handleSave}
          onCancel={() => setEditor({ mode: "closed" })}
        />
      )}

      <ConfirmDialog
        open={!!deleteTargetId}
        title={tc("confirmDeleteTitle")}
        message={t("deleteConfirm")}
        confirmLabel={tc("delete")}
        isConfirming={deleteRecipe.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTargetId(null)}
      />

      {pendingExecution && (
        <div className="space-y-3 rounded-lg border border-orange-300 bg-orange-50 p-4 text-orange-800">
          <p className="font-medium">{t("stockWarningTitle")}</p>
          <p className="text-sm">{t("stockWarningMessage")}</p>
          <ul className="list-inside list-disc space-y-1 text-sm">
            {pendingExecution.shortages.map((shortage) => (
              <li key={shortage.item_id}>
                {shortage.item_name} —{" "}
                {t("stockWarningRequired", {
                  required: shortage.required,
                  available: shortage.available,
                  unit: shortage.unit,
                })}
              </li>
            ))}
          </ul>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="border-orange-400 bg-orange-50 text-orange-800 hover:bg-orange-100"
              disabled={executingId === pendingExecution.recipe.id}
              onClick={() => void runExecute(pendingExecution.recipe, true)}
            >
              {t("executeAnyway")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPendingExecution(null)}>
              {tc("cancel")}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive p-4 text-sm text-destructive">
          {t("loadError")}
        </div>
      ) : recipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          <p className="text-lg font-medium">{t("empty")}</p>
          <p className="mt-1 text-sm">{t("emptyHint")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {recipes.map((recipe) => (
            <li
              key={recipe.id}
              className="flex items-center justify-between gap-2 rounded-lg border p-3"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{recipe.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t("itemCount", { count: recipe.items.length })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  disabled={executingId === recipe.id || recipe.items.length === 0}
                  onClick={() => void runExecute(recipe, false)}
                >
                  <Play className="mr-1 h-4 w-4" />
                  {executingId === recipe.id ? t("executing") : t("execute")}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label={t("edit")}
                  onClick={() => setEditor({ mode: "edit", recipe })}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  aria-label={t("delete")}
                  onClick={() => setDeleteTargetId(recipe.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/recipes")({
  component: RecipesPage,
});
