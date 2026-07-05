import { CheckCircle2, Pencil, ShoppingCart, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ShoppingRowProps {
  id: string;
  name: string;
  desiredUnits: number;
  note?: string | null;
  isPurchased?: boolean;
  isEditing?: boolean;
  isSaving?: boolean;
  onPurchase?: (id: string) => void;
  onDelete?: (id: string) => void;
  onEdit?: (id: string) => void;
  onEditSave?: (
    id: string,
    data: { name: string; desiredUnits: number; note: string | null },
  ) => void;
  onEditCancel?: () => void;
}

export const ShoppingRow = ({
  id,
  name,
  desiredUnits,
  note,
  isPurchased,
  isEditing,
  isSaving,
  onPurchase,
  onDelete,
  onEdit,
  onEditSave,
  onEditCancel,
}: ShoppingRowProps) => {
  const { t } = useTranslation("shopping");

  const [editName, setEditName] = useState(name);
  const [editUnits, setEditUnits] = useState(String(desiredUnits));
  const [editNote, setEditNote] = useState(note ?? "");
  const [nameError, setNameError] = useState(false);
  const [unitsError, setUnitsError] = useState<string | null>(null);

  const resetEditState = () => {
    setEditName(name);
    setEditUnits(String(desiredUnits));
    setEditNote(note ?? "");
    setNameError(false);
    setUnitsError(null);
  };

  const handleEditStart = () => {
    resetEditState();
    onEdit?.(id);
  };

  const handleSave = () => {
    if (!editName.trim()) {
      setNameError(true);
      return;
    }
    const parsedUnits = parseInt(editUnits, 10);
    if (isNaN(parsedUnits) || parsedUnits <= 0) {
      setUnitsError(t("invalidUnits"));
      return;
    }
    setUnitsError(null);
    onEditSave?.(id, {
      name: editName.trim(),
      desiredUnits: parsedUnits,
      note: editNote.trim() || null,
    });
  };

  const handleCancel = () => {
    resetEditState();
    onEditCancel?.();
  };

  if (isEditing) {
    return (
      <div className="space-y-2 rounded-lg border p-3">
        <Input
          value={editName}
          onChange={(e) => {
            setEditName(e.target.value);
            if (nameError) setNameError(false);
          }}
          placeholder={t("itemNamePlaceholder")}
          autoFocus
          disabled={isSaving}
          aria-invalid={nameError}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
        />
        {nameError && <p className="mt-0.5 text-xs text-destructive">{t("nameRequired")}</p>}
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              type="number"
              min={1}
              value={editUnits}
              onChange={(e) => {
                setEditUnits(e.target.value);
                setUnitsError(null);
              }}
              placeholder={t("desiredUnitsLabel")}
              disabled={isSaving}
              aria-invalid={!!unitsError}
            />
            {unitsError && <p className="mt-0.5 text-xs text-destructive">{unitsError}</p>}
          </div>
          <div className="flex-[2]">
            <Input
              value={editNote}
              onChange={(e) => setEditNote(e.target.value)}
              placeholder={t("notePlaceholder")}
              disabled={isSaving}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={handleSave}
            disabled={!editName.trim() || isSaving}
          >
            {isSaving ? <Spinner className="h-4 w-4" /> : t("editSave")}
          </Button>
          <Button size="sm" variant="outline" onClick={handleCancel} disabled={isSaving}>
            {t("editCancel")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 ${isPurchased ? "opacity-60" : ""}`}
    >
      {isPurchased ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
      ) : (
        <ShoppingCart className="h-5 w-5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className={`font-medium ${isPurchased ? "line-through" : ""}`}>{name}</p>
        <p className="text-sm text-muted-foreground">
          {t("desiredUnits")}: {desiredUnits}
          {note && ` · ${note}`}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        {!isPurchased && onPurchase && (
          <Button variant="outline" size="sm" onClick={() => onPurchase(id)}>
            {t("markPurchased")}
          </Button>
        )}
        {!isPurchased && onEdit && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground"
            onClick={handleEditStart}
            aria-label={t("editItem")}
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(id)}
            aria-label={t("common:delete")}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
};
