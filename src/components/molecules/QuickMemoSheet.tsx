import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface QuickMemoSheetProps {
  open: boolean;
  itemName: string;
  initialNotes: string;
  isSubmitting?: boolean;
  onSave: (notes: string) => void;
  onClose: () => void;
}

/**
 * 在庫一覧のカードから詳細ページに遷移せずメモ (`notes`) だけを素早く編集するボトムシート（#380）。
 * モバイルでは画面下からのシート、デスクトップでは中央のダイアログとして表示する。
 */
export const QuickMemoSheet = ({
  open,
  itemName,
  initialNotes,
  isSubmitting = false,
  onSave,
  onClose,
}: QuickMemoSheetProps) => {
  const { t } = useTranslation("items");
  const { t: tCommon } = useTranslation("common");
  const [notes, setNotes] = useState(initialNotes);
  const [prevOpen, setPrevOpen] = useState(open);

  // シートが開くたびに、その時点の item.notes を初期値としてリセットする（prop 変化時の state 調整）
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setNotes(initialNotes);
  }

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, isSubmitting, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center"
      onClick={() => !isSubmitting && onClose()}
    >
      <div
        className="w-full rounded-t-2xl bg-background p-4 shadow-xl sm:max-w-md sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t("quickMemoTitle", { name: itemName })}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label={tCommon("close")}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("notesPlaceholder")}
          rows={4}
          autoFocus
          aria-label={t("notes")}
        />
        <div className="mt-4 flex gap-2">
          <Button
            className="flex-1"
            onClick={() => onSave(notes)}
            disabled={isSubmitting || notes === initialNotes}
          >
            {isSubmitting ? <Spinner className="h-4 w-4" /> : tCommon("save")}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            {tCommon("cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
};
