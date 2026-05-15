import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, PackagePlus } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ItemForm } from "@/components/organisms/ItemForm";
import { Button } from "@/components/ui/button";
import { uploadItemImage } from "@/hooks/useItemImage";
import { findActiveItemByBarcode, useCreateItem } from "@/hooks/useItems";
import { OfflineError } from "@/lib/requireOnline";
import { useToast } from "@/lib/toast-context";
import type { Item, ItemFormValues } from "@/types/item";

const NewItemPage = () => {
  const { t } = useTranslation("items");
  const navigate = useNavigate();
  const createItem = useCreateItem();
  const { toast } = useToast();
  const pendingFileRef = useRef<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingItem, setExistingItem] = useState<Item | null>(null);

  const handleBarcodeScanned = async (barcode: string, source: "db" | "api" | null) => {
    if (source !== "db") {
      setExistingItem(null);
      return;
    }
    const found = await findActiveItemByBarcode(barcode);
    setExistingItem(found);
  };

  const handleSubmit = async (values: ItemFormValues) => {
    setIsSubmitting(true);
    try {
      const item = await createItem.mutateAsync(values);
      const result = item as Item & { _stacked?: boolean; _revived?: boolean };

      if (pendingFileRef.current && item && !result._stacked) {
        try {
          await uploadItemImage({ itemId: item.id, file: pendingFileRef.current });
        } catch (err) {
          toast(
            err instanceof OfflineError ? t("common:offlineError") : t("imageUploadFailed"),
            err instanceof OfflineError ? "error" : "warning",
          );
          void navigate({ to: "/" });
          return;
        }
      }

      if (result._stacked) {
        toast(t("stackSuccess"), "success");
        void navigate({
          to: "/items/$itemId",
          params: { itemId: item.id },
        });
      } else {
        toast(t("createSuccess"), "success");
        void navigate({ to: "/" });
      }
    } catch {
      toast(t("common:unknownError"), "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => void navigate({ to: "/" })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">{t("addItem")}</h1>
      </div>

      {existingItem && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <PackagePlus className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium text-primary">{t("stackBannerTitle")}</p>
            <p className="mt-0.5 text-muted-foreground">
              {t("stackBannerBody", { name: existingItem.name })}
            </p>
          </div>
        </div>
      )}

      <ItemForm
        onSubmit={(values) => {
          void handleSubmit(values);
        }}
        isSubmitting={isSubmitting}
        onPendingFileChange={(file) => {
          pendingFileRef.current = file;
        }}
        onBarcodeScanned={(barcode, source) => {
          void handleBarcodeScanned(barcode, source);
        }}
        submitLabel={existingItem ? t("stackSubmitLabel") : undefined}
      />
    </div>
  );
};

export const Route = createFileRoute("/_auth/items/new")({
  component: NewItemPage,
});
