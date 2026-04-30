import { createFileRoute } from "@tanstack/react-router";
import { Plus, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { ShoppingRow } from "@/components/molecules/ShoppingRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeleteShoppingItem, usePurchaseShoppingItem, useShoppingList, useUpsertShoppingItem } from "@/hooks/useShoppingList";
import { useToast } from "@/lib/toast";
import type { ItemFormValues } from "@/types/item";

import { PurchaseDialog } from "../components/molecules/PurchaseDialog";

const ShoppingPage = () => {
  const { t } = useTranslation("shopping");
  const { toast } = useToast();
  const [tab, setTab] = useState<"planned" | "purchased">("planned");
  const [addName, setAddName] = useState("");
  const [addNote, setAddNote] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [pendingPurchaseId, setPendingPurchaseId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: items = [], isLoading } = useShoppingList(tab);
  const upsert = useUpsertShoppingItem();
  const deleteItem = useDeleteShoppingItem();
  const purchase = usePurchaseShoppingItem();

  const handleAdd = async () => {
    if (!addName.trim()) return;
    try {
      await upsert.mutateAsync({ name: addName.trim(), note: addNote || null });
      toast(t("addSuccess"), "success");
      setAddName("");
      setAddNote("");
      setShowAdd(false);
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteId(null);
    try {
      await deleteItem.mutateAsync(deleteId);
      toast(t("deleteSuccess"), "success");
    } catch {
      toast(t("common:unknownError"), "error");
    }
  };

  const handlePurchase = async (values: ItemFormValues) => {
    if (!pendingPurchaseId) return;
    const id = pendingPurchaseId;
    setPendingPurchaseId(null);
    try {
      await purchase.mutateAsync({ shoppingItemId: id, itemValues: values });
      toast(t("purchaseSuccess"), "success");
    } catch {
      toast(t("purchaseError"), "error");
    }
  };

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={!!deleteId}
        title={t("common:confirmDeleteTitle")}
        message={t("deleteConfirm")}
        confirmLabel={t("common:delete")}
        onConfirm={() => { void handleDelete(); }}
        onCancel={() => setDeleteId(null)}
      />

      {pendingPurchaseId && (
        <PurchaseDialog
          open={!!pendingPurchaseId}
          onSubmit={(values) => { void handlePurchase(values); }}
          onClose={() => setPendingPurchaseId(null)}
          isSubmitting={purchase.isPending}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-6 w-6" />
          <h1 className="text-2xl font-bold">{t("title")}</h1>
        </div>
        <Button size="sm" onClick={() => setShowAdd((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" />
          {t("addItem")}
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="add-name">{t("itemName")}</Label>
            <Input
              id="add-name"
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder={t("itemNamePlaceholder")}
              onKeyDown={(e) => { if (e.key === "Enter") void handleAdd(); }}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="add-note">{t("note")}</Label>
            <Input
              id="add-note"
              value={addNote}
              onChange={(e) => setAddNote(e.target.value)}
              placeholder={t("notePlaceholder")}
            />
          </div>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => { void handleAdd(); }}
              disabled={!addName.trim() || upsert.isPending}
            >
              {t("addItem")}
            </Button>
            <Button variant="outline" onClick={() => setShowAdd(false)}>
              {t("common:cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex rounded-lg border p-1">
        {(["planned", "purchased"] as const).map((s) => (
          <button
            key={s}
            className={`flex-1 rounded py-1.5 text-sm font-medium transition-colors ${
              tab === s ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setTab(s)}
          >
            {t(`status${s.charAt(0).toUpperCase()}${s.slice(1)}` as "statusPlanned" | "statusPurchased")}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : items.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          {tab === "planned" ? t("noItems") : t("noPurchased")}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <ShoppingRow
              key={item.id}
              id={item.id}
              name={item.name}
              desiredUnits={item.desired_units}
              note={item.note}
              isPurchased={item.status === "purchased"}
              onPurchase={tab === "planned" ? (id) => setPendingPurchaseId(id) : undefined}
              onDelete={(id) => setDeleteId(id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/shopping")({
  component: ShoppingPage,
});
