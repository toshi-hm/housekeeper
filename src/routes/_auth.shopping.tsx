import { createFileRoute } from "@tanstack/react-router";
import { Plus, ScanLine, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ShareButton } from "@/components/atoms/ShareButton";
import { Skeleton } from "@/components/atoms/Skeleton";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { ScanToShoppingDialog } from "@/components/molecules/ScanToShoppingDialog";
import { ShoppingRow } from "@/components/molecules/ShoppingRow";
import { BarcodeScanner } from "@/components/organisms/BarcodeScanner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBarcodeLookup } from "@/hooks/useBarcodeLookup";
import { findActiveItemByBarcode } from "@/hooks/useItems";
import {
  useDeleteAllPurchasedItems,
  useDeleteShoppingItem,
  usePurchaseShoppingItem,
  useShoppingList,
  useUpsertShoppingItem,
} from "@/hooks/useShoppingList";
import { useToast } from "@/lib/toast-context";
import type { ItemFormValues } from "@/types/item";

import { PurchaseDialog } from "../components/molecules/PurchaseDialog";

interface ScanDraft {
  barcode: string;
  defaultName: string;
  matchedExisting: boolean;
  linkedItemId: string | null;
}

type ShoppingTab = "planned" | "purchased";

const tabLabelKey = {
  planned: "statusPlanned",
  purchased: "statusPurchased",
} as const satisfies Record<ShoppingTab, string>;

const ShoppingPage = () => {
  const { t } = useTranslation("shopping");
  const { toast } = useToast();
  const [tab, setTab] = useState<ShoppingTab>("planned");
  const [addName, setAddName] = useState("");
  const [addNote, setAddNote] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [pendingPurchaseId, setPendingPurchaseId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showClearPurchased, setShowClearPurchased] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scanDraft, setScanDraft] = useState<ScanDraft | null>(null);
  const [isLooking, setIsLooking] = useState(false);

  const { data: items = [], isLoading } = useShoppingList(tab);
  const { data: plannedItems = [] } = useShoppingList("planned");
  const upsert = useUpsertShoppingItem();
  const deleteItem = useDeleteShoppingItem();
  const purchase = usePurchaseShoppingItem();
  const clearPurchased = useDeleteAllPurchasedItems();
  const { lookup } = useBarcodeLookup();

  const handleAdd = async () => {
    if (!addName.trim()) return;
    try {
      await upsert.mutateAsync({ name: addName.trim(), note: addNote || null });
      toast(t("addSuccess"), "success");
      setAddName("");
      setAddNote("");
      setShowAdd(false);
    } catch {
      // Error toast is handled by useUpsertShoppingItem.onError
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteItem.mutateAsync(deleteId);
      setDeleteId(null);
      toast(t("deleteSuccess"), "success");
    } catch {
      // Error toast is handled by useDeleteShoppingItem.onError
    }
  };

  const handleClearPurchased = async () => {
    try {
      await clearPurchased.mutateAsync();
      toast(t("clearPurchasedSuccess"), "success");
    } catch {
      // Error toast is handled by useDeleteAllPurchasedItems.onError
    }
  };

  const handleEdit = async (
    id: string,
    data: { name: string; desiredUnits: number; note: string | null },
  ) => {
    setSavingId(id);
    try {
      await upsert.mutateAsync({
        id,
        name: data.name,
        desired_units: data.desiredUnits,
        note: data.note,
      });
      setEditId(null);
      toast(t("editSuccess"), "success");
    } catch {
      // Error toast is handled by useUpsertShoppingItem.onError
    } finally {
      setSavingId(null);
    }
  };

  const handlePurchase = async (values: ItemFormValues) => {
    if (!pendingPurchaseId) return;
    const id = pendingPurchaseId;
    try {
      await purchase.mutateAsync({ shoppingItemId: id, itemValues: values });
      setPendingPurchaseId(null);
      toast(t("purchaseSuccess"), "success");
    } catch {
      // Error toast is handled by usePurchaseShoppingItem.onError
    }
  };

  // バーコードスキャン → 在庫一致 or バーコードAPIで商品名を解決し、確認ダイアログを開く
  const handleScan = async (barcode: string) => {
    setShowScanner(false);
    setIsLooking(true);
    setScanDraft({ barcode, defaultName: "", matchedExisting: false, linkedItemId: null });
    try {
      const existing = await findActiveItemByBarcode(barcode);
      if (existing) {
        setScanDraft({
          barcode,
          defaultName: existing.name,
          matchedExisting: true,
          linkedItemId: existing.id,
        });
        return;
      }
      const result = await lookup(barcode);
      setScanDraft({
        barcode,
        defaultName: result.product?.name ?? "",
        matchedExisting: false,
        linkedItemId: null,
      });
    } catch {
      setScanDraft({ barcode, defaultName: "", matchedExisting: false, linkedItemId: null });
    } finally {
      setIsLooking(false);
    }
  };

  const handleScanConfirm = async (name: string) => {
    if (!scanDraft) return;
    try {
      await upsert.mutateAsync({ name, linked_item_id: scanDraft.linkedItemId });
      setScanDraft(null);
      toast(t("addSuccess"), "success");
    } catch {
      // Error toast is handled by useUpsertShoppingItem.onError
    }
  };

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={!!deleteId}
        title={t("common:confirmDeleteTitle")}
        message={t("deleteConfirm")}
        confirmLabel={t("common:delete")}
        isConfirming={deleteItem.isPending}
        onConfirm={() => {
          void handleDelete();
        }}
        onCancel={() => setDeleteId(null)}
      />
      <ConfirmDialog
        open={showClearPurchased}
        title={t("clearPurchasedTitle")}
        message={t("clearPurchasedConfirm")}
        confirmLabel={t("clearPurchasedConfirmLabel")}
        variant="destructive"
        isConfirming={clearPurchased.isPending}
        onConfirm={() => {
          setShowClearPurchased(false);
          void handleClearPurchased();
        }}
        onCancel={() => setShowClearPurchased(false)}
      />

      {pendingPurchaseId && (
        <PurchaseDialog
          open={!!pendingPurchaseId}
          itemName={plannedItems.find((i) => i.id === pendingPurchaseId)?.name}
          onSubmit={(values) => {
            void handlePurchase(values);
          }}
          onClose={() => {
            if (!purchase.isPending) setPendingPurchaseId(null);
          }}
          isSubmitting={purchase.isPending}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-6 w-6" />
          <h1 className="text-2xl font-bold">{t("title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          {plannedItems.length > 0 && (
            <ShareButton
              title={t("shareShoppingList")}
              text={plannedItems
                .map((item) =>
                  item.desired_units > 1
                    ? `・${item.name} ×${item.desired_units}`
                    : `・${item.name}`,
                )
                .join("\n")}
              label={t("share")}
            />
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowScanner(true)}
            aria-label={t("scanAdd")}
          >
            <ScanLine className="mr-1 h-4 w-4" />
            {t("scanAdd")}
          </Button>
          <Button size="sm" onClick={() => setShowAdd((v) => !v)}>
            <Plus className="mr-1 h-4 w-4" />
            {t("addItem")}
          </Button>
        </div>
      </div>

      {showScanner && (
        <BarcodeScanner
          onScan={(barcode) => {
            void handleScan(barcode);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}

      <ScanToShoppingDialog
        open={scanDraft !== null}
        isLooking={isLooking}
        defaultName={scanDraft?.defaultName ?? ""}
        matchedExisting={scanDraft?.matchedExisting ?? false}
        isSubmitting={upsert.isPending}
        onConfirm={(name) => {
          void handleScanConfirm(name);
        }}
        onClose={() => setScanDraft(null)}
      />

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
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAdd();
              }}
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
              onClick={() => {
                void handleAdd();
              }}
              disabled={!addName.trim() || upsert.isPending}
            >
              {t("addItem")}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setAddName("");
                setAddNote("");
                setShowAdd(false);
              }}
            >
              {t("common:cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex rounded-lg border p-1" role="tablist">
        {(["planned", "purchased"] as const satisfies ShoppingTab[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={tab === s}
            className={`flex-1 rounded py-1.5 text-sm font-medium transition-colors ${
              tab === s
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => {
              setTab(s);
              setShowAdd(false);
            }}
          >
            {t(tabLabelKey[s])}
          </button>
        ))}
      </div>

      {/* Clear purchased button */}
      {tab === "purchased" && items.length > 0 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setShowClearPurchased(true)}
          >
            {t("clearPurchased")}
          </Button>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-lg border p-3">
              <Skeleton className="h-5 w-5 rounded" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          ))}
        </div>
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
              isEditing={editId === item.id}
              isSaving={savingId === item.id}
              onPurchase={tab === "planned" ? (id) => setPendingPurchaseId(id) : undefined}
              onDelete={(id) => setDeleteId(id)}
              onEdit={tab === "planned" ? (id) => setEditId(id) : undefined}
              onEditSave={(id, data) => {
                void handleEdit(id, data);
              }}
              onEditCancel={() => setEditId(null)}
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
