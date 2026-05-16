import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ItemForm } from "@/components/organisms/ItemForm";
import { Button } from "@/components/ui/button";
import { downloadExternalImageAsFile, uploadItemImage } from "@/hooks/useItemImage";
import { useItem, useUpdateItem } from "@/hooks/useItems";
import { OfflineError } from "@/lib/requireOnline";
import { useToast } from "@/lib/toast-context";
import type { ItemFormValues } from "@/types/item";

const EditItemPage = () => {
  const { t } = useTranslation("items");
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const { data: item, isLoading } = useItem(itemId);
  const updateItem = useUpdateItem(itemId);
  const { toast } = useToast();
  const pendingFileRef = useRef<File | null>(null);
  const pendingImageUrlRef = useRef<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values: ItemFormValues) => {
    setIsSubmitting(true);
    try {
      const oldImagePath = item?.image_path ?? null;
      await updateItem.mutateAsync(values);
      const pendingFile = pendingFileRef.current;
      const pendingImageUrl = pendingImageUrlRef.current;
      if (pendingFile || pendingImageUrl) {
        try {
          const file =
            pendingFile ??
            (pendingImageUrl ? await downloadExternalImageAsFile(pendingImageUrl) : null);
          if (file) await uploadItemImage({ itemId, file, oldImagePath });
        } catch (err) {
          toast(
            err instanceof OfflineError ? t("common:offlineError") : t("imageUploadFailed"),
            err instanceof OfflineError ? "error" : "warning",
          );
          void navigate({ to: "/items/$itemId", params: { itemId } });
          return;
        }
      }
      toast(t("updateSuccess"), "success");
      void navigate({ to: "/items/$itemId", params: { itemId } });
    } catch {
      toast(t("common:unknownError"), "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon" onClick={() => void navigate({ to: "/" })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="space-y-3 rounded-lg border border-destructive p-4 text-destructive">
          <p className="font-medium">{t("itemNotFound")}</p>
          <p className="text-sm text-muted-foreground">{t("itemNotFoundDescription")}</p>
          <Button variant="outline" onClick={() => void navigate({ to: "/" })}>
            {t("backToItems")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void navigate({ to: "/items/$itemId", params: { itemId } })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">{t("editItem")}</h1>
      </div>
      <ItemForm
        defaultValues={{
          name: item.name,
          barcode: item.barcode ?? undefined,
          category_id: item.category_id,
          storage_location_id: item.storage_location_id,
          units: item.units,
          content_amount: item.content_amount,
          content_unit: item.content_unit,
          opened_remaining: item.opened_remaining,
          purchase_date: item.purchase_date ?? undefined,
          expiry_date: item.expiry_date ?? undefined,
          notes: item.notes ?? undefined,
          image_path: item.image_path ?? undefined,
        }}
        onSubmit={(values) => {
          void handleSubmit(values);
        }}
        isSubmitting={isSubmitting}
        onPendingFileChange={(file) => {
          pendingFileRef.current = file;
        }}
        onPendingImageUrlChange={(url) => {
          pendingImageUrlRef.current = url;
        }}
      />
    </div>
  );
};

export const Route = createFileRoute("/_auth/items/$itemId/edit")({
  component: EditItemPage,
});
