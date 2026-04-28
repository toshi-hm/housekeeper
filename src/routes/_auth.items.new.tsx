import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import { ItemForm } from "@/components/ItemForm";
import { Button } from "@/components/ui/button";
import { useCreateItem } from "@/hooks/useItems";
import type { ItemFormValues } from "@/types/item";

const NewItemPage = () => {
  const navigate = useNavigate();
  const createItem = useCreateItem();

  const handleSubmit = async (values: ItemFormValues) => {
    await createItem.mutateAsync(values);
    void navigate({ to: "/" });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => void navigate({ to: "/" })}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">Add New Item</h1>
      </div>
      {createItem.error && (
        <div className="rounded-lg border border-destructive p-3 text-sm text-destructive">
          {createItem.error instanceof Error ? createItem.error.message : "Failed to create item"}
        </div>
      )}
      <ItemForm
        onSubmit={(values) => {
          void handleSubmit(values);
        }}
        isSubmitting={createItem.isPending}
        submitLabel="Add Item"
      />
    </div>
  );
};

export const Route = createFileRoute("/_auth/items/new")({
  component: NewItemPage,
});
