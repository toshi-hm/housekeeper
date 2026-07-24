import { X } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { ItemForm } from "@/components/organisms/ItemForm";
import { Button } from "@/components/ui/button";
import { useDialogA11y } from "@/hooks/useDialogA11y";
import type { ItemFormValues } from "@/types/item";

interface PurchaseDialogProps {
  open: boolean;
  itemName?: string;
  onSubmit: (values: ItemFormValues) => void;
  onClose: () => void;
  isSubmitting?: boolean;
  onPendingFileChange?: (file: File | null) => void;
  onPendingImageUrlChange?: (url: string | null) => void;
}

export const PurchaseDialog = ({
  open,
  itemName,
  onSubmit,
  onClose,
  isSubmitting = false,
  onPendingFileChange,
  onPendingImageUrlChange,
}: PurchaseDialogProps) => {
  const { t } = useTranslation("shopping");
  const { t: tCommon } = useTranslation("common");
  const titleId = useId();
  const containerRef = useDialogA11y<HTMLDivElement>({
    open,
    onClose,
    disableClose: isSubmitting,
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center"
      onClick={() => !isSubmitting && onClose()}
    >
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="w-full max-h-[90vh] overflow-y-auto rounded-t-2xl bg-background p-4 shadow-xl sm:max-w-lg sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold">
            {t("purchaseDialog")}
          </h2>
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
        <ItemForm
          defaultValues={{ name: itemName ?? "", units: 1 }}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          submitLabel={t("createItemFromPurchase")}
          onPendingFileChange={onPendingFileChange}
          onPendingImageUrlChange={onPendingImageUrlChange}
        />
      </div>
    </div>
  );
};
