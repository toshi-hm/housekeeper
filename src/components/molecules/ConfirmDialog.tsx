import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { Button } from "@/components/ui/button";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "default";
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = "destructive",
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const { t } = useTranslation();

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
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} aria-hidden="true" />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl"
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        <p id="confirm-dialog-desc" className="mt-2 text-sm text-gray-600">
          {message}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={isConfirming}>
            {cancelLabel ?? t("cancel")}
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            size="sm"
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {isConfirming ? <Spinner className="h-4 w-4" /> : (confirmLabel ?? t("confirm"))}
          </Button>
        </div>
      </div>
    </div>
  );
};
