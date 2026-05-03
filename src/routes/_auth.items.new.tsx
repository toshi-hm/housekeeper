import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";

import { ItemForm } from "@/components/organisms/ItemForm";
import { Button } from "@/components/ui/button";
import { uploadItemImage } from "@/hooks/useItemImage";
import { useCreateItem } from "@/hooks/useItems";
import { useToast } from "@/lib/toast";
import type { ItemFormValues } from "@/types/item";

const NewItemPage = () => {
  const { t } = useTranslation("items");
  const navigate = useNavigate();
  const createItem = useCreateItem();
  const { toast } = useToast();
  const pendingFileRef = useRef<File | null>(null);

  const handleSubmit = async (values: ItemFormValues) => {
    try {
      const item = await createItem.mutateAsync(values);
      if (pendingFileRef.current && item) {
        await uploadItemImage({ itemId: item.id, file: pendingFileRef.current });
      }
      toast(t("createSuccess"), "success");
      void navigate({ to: "/" });
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  return (
    <div className="space-y-4">
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
        isSubmitting={createItem.isPending}
        onPendingFileChange={(file) => {
          pendingFileRef.current = file;
        }}
      />
    </div>
  );
};

export const Route = createFileRoute("/_auth/items/new")({
  component: NewItemPage,
});
