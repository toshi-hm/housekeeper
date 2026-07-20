import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { Button } from "@/components/ui/button";
import { ITEM_DELETION_REASONS, type ItemDeletionReason } from "@/types/item";

interface DeletionReasonDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  onConfirm: (reason: ItemDeletionReason) => void;
  onCancel: () => void;
}

const REASON_LABEL_KEY = {
  consumed: "deletionReasonConsumed",
  expired_waste: "deletionReasonExpiredWaste",
  other: "deletionReasonOther",
} as const satisfies Record<ItemDeletionReason, string>;

/**
 * ソフトデリート（アイテム削除・一括削除）時に削除理由を選択させるダイアログ（#494）。
 * 「使い切った」か「期限切れで廃棄した」かを区別して記録し、フードロスダッシュボードの
 * 集計に使う。
 */
export const DeletionReasonDialog = ({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  isConfirming = false,
  onConfirm,
  onCancel,
}: DeletionReasonDialogProps) => {
  const { t } = useTranslation("items");
  const { t: tc } = useTranslation("common");
  const [reason, setReason] = useState<ItemDeletionReason>("consumed");

  // Reset the selection back to the default whenever the dialog transitions
  // from closed to open, without calling setState from inside an effect
  // (render-phase state adjustment per React docs — same pattern as the
  // dashboard's pagination reset in _auth.index.tsx).
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) setReason("consumed");
  }

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isConfirming) onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, isConfirming, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !isConfirming && onCancel()}
        aria-hidden="true"
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="deletion-reason-dialog-title"
        aria-describedby="deletion-reason-dialog-desc"
        className="relative w-full max-w-sm rounded-xl bg-background p-6 shadow-xl"
      >
        <h2 id="deletion-reason-dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        <p id="deletion-reason-dialog-desc" className="mt-2 text-sm text-muted-foreground">
          {message}
        </p>
        <fieldset className="mt-4 space-y-2">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">
            {t("deletionReasonLabel")}
          </legend>
          {ITEM_DELETION_REASONS.map((value) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5"
            >
              <input
                type="radio"
                name="deletion-reason"
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                disabled={isConfirming}
                className="h-4 w-4 accent-primary"
              />
              {t(REASON_LABEL_KEY[value])}
            </label>
          ))}
        </fieldset>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isConfirming}>
            {cancelLabel ?? tc("cancel")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => onConfirm(reason)}
            disabled={isConfirming}
          >
            {isConfirming ? <Spinner className="h-4 w-4" /> : (confirmLabel ?? tc("delete"))}
          </Button>
        </div>
      </div>
    </div>
  );
};
