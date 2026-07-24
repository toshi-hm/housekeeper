import { X } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useDialogA11y } from "@/hooks/useDialogA11y";

interface BulkMoveDialogOption {
  id: string;
  name: string;
}

interface BulkMoveDialogProps {
  open: boolean;
  title: string;
  /** 「未設定」選択肢のラベル */
  noneLabel: string;
  confirmLabel: string;
  cancelLabel: string;
  options: BulkMoveDialogOption[];
  isSubmitting?: boolean;
  /** targetId は null = 未設定にする */
  onConfirm: (targetId: string | null) => void;
  onClose: () => void;
}

/** 一括で保管場所 / カテゴリを変更する際の対象選択ダイアログ（#359）。 */
export const BulkMoveDialog = ({
  open,
  title,
  noneLabel,
  confirmLabel,
  cancelLabel,
  options,
  isSubmitting,
  onConfirm,
  onClose,
}: BulkMoveDialogProps) => {
  const [value, setValue] = useState("");
  const titleId = useId();
  const containerRef = useDialogA11y<HTMLDivElement>({
    open,
    onClose,
    disableClose: isSubmitting,
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center">
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full rounded-t-2xl bg-background p-4 shadow-xl sm:max-w-sm sm:rounded-2xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label={cancelLabel}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <Select
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mb-4"
          aria-label={title}
        >
          <option value="">{noneLabel}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Button
            className="flex-1"
            onClick={() => onConfirm(value || null)}
            disabled={isSubmitting}
          >
            {confirmLabel}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
};
