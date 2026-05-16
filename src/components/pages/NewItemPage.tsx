import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ItemForm } from "@/components/organisms/ItemForm";
import { Button } from "@/components/ui/button";
import { downloadExternalImageAsFile, uploadItemImage } from "@/hooks/useItemImage";
import { useCreateItem } from "@/hooks/useItems";
import { OfflineError } from "@/lib/requireOnline";
import { useToast } from "@/lib/toast-context";
import type { ItemFormValues } from "@/types/item";

export const NewItemPage = () => {
  const { t } = useTranslation("items");
  const navigate = useNavigate();
  const createItem = useCreateItem();
  const { toast } = useToast();
  const pendingFileRef = useRef<File | null>(null);
  const pendingImageUrlRef = useRef<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (values: ItemFormValues) => {
    setIsSubmitting(true);
    try {
      const item = await createItem.mutateAsync(values);
      const pendingFile = pendingFileRef.current;
      const pendingImageUrl = pendingImageUrlRef.current;
      if ((pendingFile || pendingImageUrl) && item) {
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
          void navigate({ to: "/" });
          return;
        }
      }
      toast(t("createSuccess"), "success");
      void navigate({ to: "/" });
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
      <ItemForm
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
