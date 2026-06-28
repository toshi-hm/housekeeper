import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, PackagePlus } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Skeleton } from "@/components/atoms/Skeleton";
import { MultiTagSelect } from "@/components/molecules/MultiTagSelect";
import { ItemForm } from "@/components/organisms/ItemForm";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { downloadExternalImageAsFile, uploadItemImage } from "@/hooks/useItemImage";
import { findActiveItemByBarcode, useCreateItem, useItem } from "@/hooks/useItems";
import { setItemTags, useCreateTag, useTags } from "@/hooks/useTags";
import { OfflineError } from "@/lib/requireOnline";
import { useToast } from "@/lib/toast-context";
import type { Item, ItemFormValues } from "@/types/item";

interface NewItemPageProps {
  cloneFrom?: string;
}

export const NewItemPage = ({ cloneFrom }: NewItemPageProps) => {
  const { t } = useTranslation("items");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const createItem = useCreateItem();
  const { toast } = useToast();
  const pendingFileRef = useRef<File | null>(null);
  const pendingImageUrlRef = useRef<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingItem, setExistingItem] = useState<Item | null>(null);
  const [pendingValues, setPendingValues] = useState<ItemFormValues | null>(null);
  const { data: tags = [] } = useTags();
  const createTag = useCreateTag();
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [showStackDialog, setShowStackDialog] = useState(false);

  const { data: cloneSource, isLoading: isCloneLoading } = useItem(cloneFrom ?? "");

  const handleBarcodeScanned = async (barcode: string, source: "db" | "api" | null) => {
    if (source !== "db") {
      setExistingItem(null);
      return;
    }
    const found = await findActiveItemByBarcode(barcode);
    setExistingItem(found);
  };

  const submitItem = async (values: ItemFormValues, forceNew: boolean) => {
    setIsSubmitting(true);
    try {
      const item = await createItem.mutateAsync({ values, forceNew });
      const result = item as Item & { _stacked?: boolean; _revived?: boolean };

      // タグを保存（既存アイテムへのスタック時は上書きしない）
      if (selectedTagIds.length > 0 && !result._stacked) {
        try {
          await setItemTags(item.id, selectedTagIds);
        } catch {
          // タグ保存失敗は非致命。アイテム自体は作成済み。
        }
      }

      const pendingFile = pendingFileRef.current;
      const pendingImageUrl = pendingImageUrlRef.current;
      if ((pendingFile || pendingImageUrl) && item && !result._stacked) {
        try {
          const file =
            pendingFile ??
            (pendingImageUrl ? await downloadExternalImageAsFile(pendingImageUrl) : null);
          if (file) await uploadItemImage({ itemId: item.id, file });
        } catch (err) {
          toast(
            err instanceof OfflineError ? t("common:offlineError") : t("imageUploadFailed"),
            err instanceof OfflineError ? "error" : "warning",
          );
          await qc.invalidateQueries({ queryKey: ["items"] });
          void navigate({ to: "/" });
          return;
        }
      }

      await qc.invalidateQueries({ queryKey: ["items"] });
      if (result._stacked) {
        toast(t("stackSuccess"), "success");
        void navigate({ to: "/items/$itemId", params: { itemId: item.id } });
      } else {
        toast(cloneFrom ? t("cloneSuccess") : t("createSuccess"), "success");
        void navigate({ to: "/" });
      }
    } catch {
      toast(t("common:unknownError"), "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (values: ItemFormValues) => {
    if (existingItem) {
      setPendingValues(values);
      setShowStackDialog(true);
      return;
    }
    void submitItem(values, false);
  };

  const handleDialogStack = () => {
    setShowStackDialog(false);
    if (pendingValues) void submitItem(pendingValues, false);
    setPendingValues(null);
  };

  const handleDialogCreateNew = () => {
    setShowStackDialog(false);
    if (pendingValues) void submitItem(pendingValues, true);
    setPendingValues(null);
  };

  const cloneDefaultValues: Partial<ItemFormValues> | undefined = cloneSource
    ? {
        name: cloneSource.name,
        barcode: cloneSource.barcode ?? "",
        category_id: cloneSource.category_id,
        storage_location_id: cloneSource.storage_location_id,
        content_amount: cloneSource.content_amount,
        content_unit: cloneSource.content_unit,
        units: 1,
        purchase_date: "",
        expiry_date: "",
        notes: "",
      }
    : undefined;

  if (cloneFrom && isCloneLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-10 w-full rounded-md" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => void navigate({ to: "/" })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">{cloneFrom ? t("cloneItem") : t("addItem")}</h1>
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
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        onPendingFileChange={(file) => {
          pendingFileRef.current = file;
        }}
        onPendingImageUrlChange={(url) => {
          pendingImageUrlRef.current = url;
        }}
        onBarcodeScanned={(barcode, source) => {
          void handleBarcodeScanned(barcode, source);
        }}
        submitLabel={existingItem ? t("stackSubmitLabel") : undefined}
        defaultValues={cloneDefaultValues}
        extraFields={
          <div className="space-y-2">
            <Label>{t("tags")}</Label>
            <MultiTagSelect
              tags={tags}
              selectedIds={selectedTagIds}
              onChange={setSelectedTagIds}
              onCreate={(name) => createTag.mutateAsync({ name })}
              labels={{
                placeholder: t("tagPlaceholder"),
                addLabel: t("addTag"),
                removeLabel: t("common:delete"),
                empty: t("tagsEmpty"),
              }}
            />
          </div>
        }
      />

      {/* Stacking confirmation dialog */}
      {showStackDialog && existingItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowStackDialog(false)}
        >
          <div
            className="w-full max-w-sm space-y-4 rounded-xl bg-background p-5 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-base font-semibold">{t("stackDialogTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("stackDialogBody", { name: existingItem.name, units: existingItem.units })}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button onClick={handleDialogStack} className="w-full">
                {t("stackDialogStack")}
              </Button>
              <Button variant="outline" onClick={handleDialogCreateNew} className="w-full">
                {t("stackDialogCreateNew")}
              </Button>
              <Button variant="ghost" onClick={() => setShowStackDialog(false)} className="w-full">
                {t("common:cancel")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
