import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ColorDot } from "@/components/atoms/ColorDot";
import { ColorPicker } from "@/components/atoms/ColorPicker";
import { Spinner } from "@/components/atoms/Spinner";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  checkCategoryUsage,
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "@/hooks/useMasterData";
import { useToast } from "@/lib/toast-context";

const DEFAULT_COLOR = "#6b7280";

const CategoriesPage = () => {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const { data: categories = [], isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const { toast } = useToast();

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createCategory.mutateAsync({ name: newName.trim(), color: newColor });
      setNewName("");
      setNewColor(null);
      toast(t("common:saveSuccess"), "success");
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  const handleUpdate = async () => {
    if (!editId || !editName.trim()) return;
    try {
      await updateCategory.mutateAsync({ id: editId, name: editName.trim(), color: editColor });
      setEditId(null);
      toast(t("common:saveSuccess"), "success");
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  const handleDeleteClick = async (id: string) => {
    setCheckingId(id);
    try {
      const count = await checkCategoryUsage(id);
      if (count > 0) {
        toast(t("categoryInUse"), "error");
        return;
      }
      setDeleteId(id);
    } catch {
      toast(t("common:unknownError"), "error");
    } finally {
      setCheckingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteCategory.mutateAsync(deleteId);
      setDeleteId(null);
      toast(t("common:deleteSuccess"), "success");
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ConfirmDialog
        open={!!deleteId}
        title={t("deleteCategory")}
        message={t("deleteCategoryConfirm")}
        confirmLabel={tc("delete")}
        isConfirming={deleteCategory.isPending}
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => setDeleteId(null)}
      />

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => void navigate({ to: "/settings" })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">{t("categories")}</h1>
      </div>

      {/* Add form */}
      <div className="space-y-2 rounded-lg border p-3">
        <div className="flex gap-2">
          <ColorDot color={newColor ?? DEFAULT_COLOR} className="mt-2 h-5 w-5 shrink-0" />
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("categoryName")}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleCreate();
            }}
          />
          <Button
            onClick={() => {
              void handleCreate();
            }}
            disabled={createCategory.isPending || !newName.trim()}
            size="icon"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ColorPicker value={newColor} onChange={setNewColor} />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : categories.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">{t("noCategories")}</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {categories.map((c) => (
            <li key={c.id} className="space-y-2 p-3">
              {editId === c.id ? (
                <>
                  <div className="flex items-center gap-3">
                    <ColorDot color={editColor ?? DEFAULT_COLOR} className="h-5 w-5 shrink-0" />
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleUpdate();
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        void handleUpdate();
                      }}
                    >
                      {tc("save")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                      {tc("cancel")}
                    </Button>
                  </div>
                  <ColorPicker value={editColor} onChange={setEditColor} />
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <ColorDot color={c.color ?? DEFAULT_COLOR} className="h-5 w-5 shrink-0" />
                  <span className="flex-1">{c.name}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={tc("edit")}
                    onClick={() => {
                      setEditId(c.id);
                      setEditName(c.name);
                      setEditColor(c.color ?? null);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    aria-label={tc("delete")}
                    disabled={checkingId === c.id}
                    onClick={() => {
                      void handleDeleteClick(c.id);
                    }}
                  >
                    {checkingId === c.id ? (
                      <Spinner className="h-4 w-4" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/settings/categories")({
  component: CategoriesPage,
});
