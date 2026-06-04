import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ItemForm } from "@/components/organisms/ItemForm";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { downloadExternalImageAsFile, uploadItemImage } from "@/hooks/useItemImage";
import { useItemLots, useUpdateLot } from "@/hooks/useItemLots";
import { useItem, useUpdateItem } from "@/hooks/useItems";
import { OfflineError } from "@/lib/requireOnline";
import { useToast } from "@/lib/toast-context";
import type { ItemFormValues } from "@/types/item";

interface EditItemPageProps {
  itemId: string;
}

export const EditItemPage = ({ itemId }: EditItemPageProps) => {
  const { t } = useTranslation("items");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: item, isLoading } = useItem(itemId);
  const { data: lots = [] } = useItemLots(itemId);
  const updateItem = useUpdateItem(itemId);
  const updateLot = useUpdateLot();
  const { toast } = useToast();
  const pendingFileRef = useRef<File | null>(null);
  const pendingImageUrlRef = useRef<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);

  const selectedLot =
    lots.find((lot) => lot.id === (selectedLotId ?? lots[0]?.id)) ?? lots[0] ?? null;

  const handleSubmit = async (values: ItemFormValues) => {
    setIsSubmitting(true);
    try {
      const oldImagePath = item?.image_path ?? null;
      await updateItem.mutateAsync(values);
      if (selectedLot) {
        await updateLot.mutateAsync({
          lotId: selectedLot.id,
          itemId,
          values: {
            units: values.units,
            purchase_date: values.purchase_date ?? null,
            expiry_date: values.expiry_date ?? null,
          },
        });
      }
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
          await qc.invalidateQueries({ queryKey: ["items"] });
          void navigate({ to: "/items/$itemId", params: { itemId } });
          return;
        }
      }
      toast(t("updateSuccess"), "success");
      await qc.invalidateQueries({ queryKey: ["items"] });
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
      {lots.length > 1 && (
        <div className="space-y-2 rounded-lg border p-3">
          <Label htmlFor="lot-select">{t("editLot")}</Label>
          <Select
            id="lot-select"
            value={selectedLot?.id ?? ""}
            onChange={(e) => setSelectedLotId(e.target.value)}
          >
            {lots.map((lot, index) => (
              <option key={lot.id} value={lot.id}>
                {t("lotLabel", { index: index + 1 })}
              </option>
            ))}
          </Select>
        </div>
      )}
      <ItemForm
        key={selectedLot?.id ?? item.id}
        defaultValues={{
          name: item.name,
          barcode: item.barcode ?? undefined,
          category_id: item.category_id,
          storage_location_id: item.storage_location_id,
          units: selectedLot?.units ?? item.units,
          content_amount: item.content_amount,
          content_unit: item.content_unit,
          opened_remaining: item.opened_remaining,
          purchase_date: selectedLot?.purchase_date ?? item.purchase_date ?? undefined,
          expiry_date: selectedLot?.expiry_date ?? item.expiry_date ?? undefined,
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
