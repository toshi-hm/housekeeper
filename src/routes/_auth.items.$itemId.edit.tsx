import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ItemForm } from "@/components/organisms/ItemForm";
import { Button } from "@/components/ui/button";
import { useItem, useUpdateItem } from "@/hooks/useItems";
import { useToast } from "@/lib/toast";
import type { ItemFormValues } from "@/types/item";

const EditItemPage = () => {
  const { t } = useTranslation("items");
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const { data: item, isLoading } = useItem(itemId);
  const updateItem = useUpdateItem(itemId);
  const { toast } = useToast();

  const handleSubmit = async (values: ItemFormValues) => {
    try {
      await updateItem.mutateAsync(values);
      toast(t("updateSuccess"), "success");
      void navigate({ to: "/items/$itemId", params: { itemId } });
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  if (isLoading) {
    return <div className="flex min-h-[200px] items-center justify-center"><Spinner /></div>;
  }

  if (!item) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon" onClick={() => void navigate({ to: "/" })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="rounded-lg border border-destructive p-4 text-destructive">
          アイテムが見つかりません
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
        onSubmit={(values) => { void handleSubmit(values); }}
        isSubmitting={updateItem.isPending}
      />
    </div>
  );
};

export const Route = createFileRoute("/_auth/items/$itemId/edit")({
  component: EditItemPage,
});
