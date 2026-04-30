import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "@/hooks/useMasterData";
import { useToast } from "@/lib/toast";

const CategoriesPage = () => {
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const { data: categories = [], isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const { toast } = useToast();

  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await createCategory.mutateAsync(newName.trim());
      setNewName("");
      toast(t("common:saveSuccess"), "success");
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  const handleUpdate = async () => {
    if (!editId || !editName.trim()) return;
    try {
      await updateCategory.mutateAsync({ id: editId, name: editName.trim() });
      setEditId(null);
      toast(t("common:saveSuccess"), "success");
    } catch {
      toast(t("common:unknownError"), "error");
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
    <div className="space-y-4">
      <ConfirmDialog
        open={!!deleteId}
        title={t("deleteCategory")}
        message={t("deleteCategoryConfirm")}
        confirmLabel="削除"
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => setDeleteId(null)}
      />

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => void navigate({ to: "/settings" })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">{t("categories")}</h1>
      </div>

      {/* Add form */}
      <div className="flex gap-2">
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
            <li key={c.id} className="flex items-center gap-3 p-3">
              {editId === c.id ? (
                <>
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
                    保存
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                    キャンセル
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1">{c.name}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      setEditId(c.id);
                      setEditName(c.name);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setDeleteId(c.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
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
