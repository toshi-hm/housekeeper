import { ListPlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ShoppingTemplateWithItems, TemplateItemInput } from "@/types/shopping";

interface SaveInput {
  id?: string;
  name: string;
  items: TemplateItemInput[];
}

interface ShoppingTemplatesPanelProps {
  templates: ShoppingTemplateWithItems[];
  onApply: (template: ShoppingTemplateWithItems) => void;
  onSave: (input: SaveInput) => Promise<void>;
  onDelete: (id: string) => void;
  isSaving?: boolean;
  isDeleting?: boolean;
  applyingId?: string | null;
}

type EditorState = { mode: "closed" } | { mode: "new" } | { mode: "edit"; id: string };

const emptyRow = (): TemplateItemInput => ({ name: "", desired_units: 1 });

export const ShoppingTemplatesPanel = ({
  templates,
  onApply,
  onSave,
  onDelete,
  isSaving = false,
  isDeleting = false,
  applyingId = null,
}: ShoppingTemplatesPanelProps) => {
  const { t } = useTranslation("shopping");
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [name, setName] = useState("");
  const [rows, setRows] = useState<TemplateItemInput[]>([emptyRow()]);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);

  const openNew = () => {
    setEditor({ mode: "new" });
    setName("");
    setRows([emptyRow()]);
  };

  const openEdit = (template: ShoppingTemplateWithItems) => {
    setEditor({ mode: "edit", id: template.id });
    setName(template.name);
    setRows(
      template.items.length > 0
        ? template.items.map((i) => ({ name: i.name, desired_units: i.desired_units }))
        : [emptyRow()],
    );
  };

  const closeEditor = () => setEditor({ mode: "closed" });

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      await onSave({
        id: editor.mode === "edit" ? editor.id : undefined,
        name: name.trim(),
        items: rows.filter((r) => r.name.trim().length > 0),
      });
      // 保存成功後にのみエディタを閉じる。失敗時は入力内容を保持して再試行できるようにする
      // (同ルート内の handleEdit / handlePurchase と同じパターン)。エラートーストは呼び出し側で表示。
      closeEditor();
    } catch {
      // 保存失敗時はエディタを開いたままにして入力内容を保持する
    }
  };

  const updateRow = (index: number, patch: Partial<TemplateItemInput>) => {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <ConfirmDialog
        open={deleteTargetId !== null}
        title={t("common:confirmDeleteTitle")}
        message={t("templateDeleteConfirm")}
        confirmLabel={t("common:delete")}
        isConfirming={isDeleting}
        onConfirm={() => {
          if (deleteTargetId) onDelete(deleteTargetId);
          setDeleteTargetId(null);
        }}
        onCancel={() => setDeleteTargetId(null)}
      />
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t("templatesTitle")}</h2>
        {editor.mode === "closed" && (
          <Button size="sm" variant="outline" onClick={openNew}>
            <Plus className="mr-1 h-4 w-4" />
            {t("templateCreate")}
          </Button>
        )}
      </div>

      {editor.mode === "closed" ? (
        templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("templatesEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {templates.map((template) => (
              <li
                key={template.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{template.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("templateItemCount", { count: template.items.length })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    onClick={() => onApply(template)}
                    disabled={applyingId === template.id || template.items.length === 0}
                  >
                    <ListPlus className="mr-1 h-4 w-4" />
                    {t("templateApply")}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    aria-label={t("templateEdit")}
                    onClick={() => openEdit(template)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    aria-label={t("templateDelete")}
                    onClick={() => setDeleteTargetId(template.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="template-name">{t("templateName")}</Label>
            <Input
              id="template-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("templateNamePlaceholder")}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>{t("templateItems")}</Label>
            {rows.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={row.name}
                  onChange={(e) => updateRow(index, { name: e.target.value })}
                  placeholder={t("itemNamePlaceholder")}
                  className="flex-1"
                />
                <Input
                  type="number"
                  min={1}
                  value={row.desired_units}
                  onChange={(e) =>
                    updateRow(index, { desired_units: Math.max(1, Number(e.target.value) || 1) })
                  }
                  className="w-16"
                  aria-label={t("desiredUnits")}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 shrink-0"
                  aria-label={t("templateRemoveRow")}
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
              onClick={() => setRows((prev) => [...prev, emptyRow()])}
            >
              <Plus className="mr-1 h-4 w-4" />
              {t("templateAddRow")}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => void handleSave()}
              disabled={!name.trim() || isSaving}
            >
              {t("editSave")}
            </Button>
            <Button variant="outline" onClick={closeEditor} disabled={isSaving}>
              {t("editCancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
