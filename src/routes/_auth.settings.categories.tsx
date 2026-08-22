import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ColorDot } from "@/components/atoms/ColorDot";
import { ColorPicker } from "@/components/atoms/ColorPicker";
import { IconPicker } from "@/components/atoms/IconPicker";
import { MasterDataIcon } from "@/components/atoms/MasterDataIcon";
import { Spinner } from "@/components/atoms/Spinner";
import { UsageCountBadge } from "@/components/atoms/UsageCountBadge";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  checkCategoryUsage,
  useCategories,
  useCategoryUsageCounts,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from "@/hooks/useMasterData";
import { useToast } from "@/lib/toast-context";

const DEFAULT_COLOR = "#6b7280";

export const CategoriesPage = () => {
  const { t } = useTranslation("settings");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const { data: categories = [], isLoading } = useCategories();
  /** #863: 一覧表示の時点で使用中件数を取得し、削除ボタンの事前ヒントに使う。
   *  あくまでUI表示用の目安で、実際の削除可否は handleDeleteClick 内の
   *  checkCategoryUsage（クリック時のレースコンディション対策込みチェック）
   *  で改めて判定する。 */
  const { data: usageCounts = {} } = useCategoryUsageCounts();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const { toast } = useToast();

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string | null>(null);
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [newDaysUseAfterOpening, setNewDaysUseAfterOpening] = useState<number | null>(null);
  const [newDaysError, setNewDaysError] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<string | null>(null);
  const [editIcon, setEditIcon] = useState<string | null>(null);
  const [editDaysUseAfterOpening, setEditDaysUseAfterOpening] = useState<number | null>(null);
  const [editDaysError, setEditDaysError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  /** 空文字は「未設定」として許容し null を返す。それ以外で 1 以上の整数
   *  でなければ null を返しつつ、呼び出し元にエラー表示させるため isValid: false
   *  を返す（#752 セルフレビュー — 無効値をエラー表示なしに黙って捨てていた）。 */
  const parseDaysInput = (v: string): { value: number | null; isValid: boolean } => {
    if (v.trim() === "") return { value: null, isValid: true };
    const parsed = parseInt(v, 10);
    if (isNaN(parsed) || parsed < 1) return { value: null, isValid: false };
    return { value: parsed, isValid: true };
  };

  const handleCreate = async () => {
    if (!newName.trim()) return;
    if (newDaysError) return;
    try {
      await createCategory.mutateAsync({
        name: newName.trim(),
        color: newColor,
        icon: newIcon,
        daysUseAfterOpening: newDaysUseAfterOpening,
      });
      setNewName("");
      setNewColor(null);
      setNewIcon(null);
      setNewDaysUseAfterOpening(null);
      setNewDaysError("");
      toast(t("common:saveSuccess"), "success");
    } catch {
      // error is handled by the mutation's onError
    }
  };

  const handleUpdate = async () => {
    if (!editId || !editName.trim()) return;
    if (editDaysError) return;
    try {
      await updateCategory.mutateAsync({
        id: editId,
        name: editName.trim(),
        color: editColor,
        icon: editIcon,
        daysUseAfterOpening: editDaysUseAfterOpening,
      });
      setEditId(null);
      toast(t("common:saveSuccess"), "success");
    } catch {
      // error is handled by the mutation's onError
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
      // error is handled by the mutation's onError
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
          aria-label={tc("back")}
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
            maxLength={40}
            disabled={createCategory.isPending}
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
            aria-label={tc("add")}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <ColorPicker value={newColor} onChange={setNewColor} />
        <IconPicker value={newIcon} onChange={setNewIcon} />
        <div className="space-y-1">
          <label htmlFor="new-category-days" className="text-xs text-muted-foreground">
            {t("items:daysUseAfterOpening")}
          </label>
          <Input
            id="new-category-days"
            type="number"
            min={1}
            className="w-28"
            placeholder="—"
            value={newDaysUseAfterOpening ?? ""}
            onChange={(e) => {
              const { value, isValid } = parseDaysInput(e.target.value);
              setNewDaysUseAfterOpening(value);
              setNewDaysError(isValid ? "" : t("items:daysUseAfterOpeningInvalid"));
            }}
            aria-invalid={!!newDaysError}
            aria-describedby={newDaysError ? "new-category-days-error" : undefined}
          />
          {newDaysError && (
            <p id="new-category-days-error" className="text-sm text-destructive">
              {newDaysError}
            </p>
          )}
        </div>
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
                      maxLength={40}
                      disabled={updateCategory.isPending}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleUpdate();
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={() => {
                        void handleUpdate();
                      }}
                      disabled={updateCategory.isPending || !editName.trim()}
                    >
                      {tc("save")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>
                      {tc("cancel")}
                    </Button>
                  </div>
                  <ColorPicker value={editColor} onChange={setEditColor} />
                  <IconPicker value={editIcon} onChange={setEditIcon} />
                  <div className="space-y-1">
                    <label
                      htmlFor={`edit-category-days-${c.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      {t("items:daysUseAfterOpening")}
                    </label>
                    <Input
                      id={`edit-category-days-${c.id}`}
                      type="number"
                      min={1}
                      className="w-28"
                      placeholder="—"
                      value={editDaysUseAfterOpening ?? ""}
                      onChange={(e) => {
                        const { value, isValid } = parseDaysInput(e.target.value);
                        setEditDaysUseAfterOpening(value);
                        setEditDaysError(isValid ? "" : t("items:daysUseAfterOpeningInvalid"));
                      }}
                      aria-invalid={!!editDaysError}
                      aria-describedby={
                        editDaysError ? `edit-category-days-error-${c.id}` : undefined
                      }
                    />
                    {editDaysError && (
                      <p
                        id={`edit-category-days-error-${c.id}`}
                        className="text-sm text-destructive"
                      >
                        {editDaysError}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <ColorDot color={c.color ?? DEFAULT_COLOR} className="h-5 w-5 shrink-0" />
                  <MasterDataIcon icon={c.icon} />
                  <span className="flex-1">{c.name}</span>
                  <UsageCountBadge count={usageCounts[c.id] ?? 0} />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={tc("edit")}
                    onClick={() => {
                      setEditId(c.id);
                      setEditName(c.name);
                      setEditColor(c.color ?? null);
                      setEditIcon(c.icon ?? null);
                      setEditDaysUseAfterOpening(c.days_use_after_opening ?? null);
                      setEditDaysError("");
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-destructive"
                    aria-label={tc("delete")}
                    title={(usageCounts[c.id] ?? 0) > 0 ? t("categoryInUse") : undefined}
                    disabled={checkingId === c.id || (usageCounts[c.id] ?? 0) > 0}
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
