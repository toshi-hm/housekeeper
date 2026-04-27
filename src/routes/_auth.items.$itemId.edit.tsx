import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { ItemForm } from "@/components/ItemForm";
import { Button } from "@/components/ui/button";
import { useItem, useUpdateItem } from "@/hooks/useItems";
import type { ItemFormValues } from "@/types/item";

const EditItemPage = () => {
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const { data: item, isLoading } = useItem(itemId);
  const updateItem = useUpdateItem(itemId);

  const handleSubmit = async (values: ItemFormValues) => {
    await updateItem.mutateAsync(values);
    void navigate({ to: "/items/$itemId", params: { itemId } });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="icon" onClick={() => void navigate({ to: "/" })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="rounded-lg border border-destructive p-4 text-destructive">
          Item not found.
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
        <h1 className="text-xl font-bold">Edit Item</h1>
      </div>
      {updateItem.error && (
        <div className="rounded-lg border border-destructive p-3 text-sm text-destructive">
          {updateItem.error instanceof Error ? updateItem.error.message : "Failed to update item"}
        </div>
      )}
      <ItemForm
        defaultValues={item}
        onSubmit={(values) => {
          void handleSubmit(values);
        }}
        isSubmitting={updateItem.isPending}
        submitLabel="Save Changes"
      />
    </div>
  );
};

export const Route = createFileRoute("/_auth/items/$itemId/edit")({
  component: EditItemPage,
});
