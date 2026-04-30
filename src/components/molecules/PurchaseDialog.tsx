import { X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { ItemForm } from "@/components/organisms/ItemForm";
import { Button } from "@/components/ui/button";
import type { ItemFormValues } from "@/types/item";

interface PurchaseDialogProps {
  open: boolean;
  itemName?: string;
  onSubmit: (values: ItemFormValues) => void;
  onClose: () => void;
  isSubmitting?: boolean;
}

export const PurchaseDialog = ({ open, itemName, onSubmit, onClose, isSubmitting }: PurchaseDialogProps) => {
  const { t } = useTranslation("shopping");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center">
      <div className="w-full max-h-[90vh] overflow-y-auto rounded-t-2xl bg-background p-4 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t("purchaseDialog")}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <ItemForm
          defaultValues={{ name: itemName ?? "", units: 1 }}
          onSubmit={onSubmit}
          isSubmitting={isSubmitting}
          submitLabel={t("createItemFromPurchase")}
        />
      </div>
    </div>
  );
};
