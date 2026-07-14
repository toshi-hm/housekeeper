import { createFileRoute } from "@tanstack/react-router";
import { LayoutList, Plus, ScanLine, ShoppingCart } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { ShareButton } from "@/components/atoms/ShareButton";
import { Skeleton } from "@/components/atoms/Skeleton";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { ScanToShoppingDialog } from "@/components/molecules/ScanToShoppingDialog";
import { ShoppingGroupHeader } from "@/components/molecules/ShoppingGroupHeader";
import { ShoppingRow } from "@/components/molecules/ShoppingRow";
import { BarcodeScanner } from "@/components/organisms/BarcodeScanner";
import { ShoppingTemplatesPanel } from "@/components/organisms/ShoppingTemplatesPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useBarcodeLookup } from "@/hooks/useBarcodeLookup";
import { findActiveItemByBarcode, useItems } from "@/hooks/useItems";
import { useCategories } from "@/hooks/useMasterData";
import {
  useDeleteAllPurchasedItems,
  useDeleteShoppingItem,
  usePurchaseShoppingItem,
  useShoppingList,
  useUpsertShoppingItem,
} from "@/hooks/useShoppingList";
import {
  useApplyShoppingTemplate,
  useDeleteShoppingTemplate,
  useSaveShoppingTemplate,
  useShoppingTemplates,
} from "@/hooks/useShoppingTemplates";
import {
  type CategoryResolver,
  groupShoppingItemsByCategory,
  isShoppingSortKey,
  SHOPPING_SORT_KEYS,
  type ShoppingSortKey,
  sortShoppingItems,
} from "@/lib/shoppingView";
import { useToast } from "@/lib/toast-context";
import type { ItemFormValues } from "@/types/item";
import type { ShoppingItem, ShoppingTemplateWithItems } from "@/types/shopping";

import { PurchaseDialog } from "../components/molecules/PurchaseDialog";

const SORT_STORAGE_KEY = "shopping.sort";

const sortLabelKey = {
  added: "sortAdded",
  category: "sortCategory",
  name: "sortName",
  priority: "sortPriority",
} as const satisfies Record<ShoppingSortKey, string>;

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
  const [showTemplates, setShowTemplates] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const [sort, setSort] = useState<ShoppingSortKey>(() => {
    const saved = localStorage.getItem(SORT_STORAGE_KEY);
    return saved && isShoppingSortKey(saved) ? saved : "added";
  });
  const [showScanner, setShowScanner] = useState(false);
  const [scanDraft, setScanDraft] = useState<ScanDraft | null>(null);
  const [isLooking, setIsLooking] = useState(false);

  const { data: items = [], isLoading } = useShoppingList(tab);
  const { data: plannedItems = [] } = useShoppingList("planned");
  const { data: templates = [] } = useShoppingTemplates();
  const { data: inventoryItems = [] } = useItems();
  const { data: categories = [] } = useCategories();
  const upsert = useUpsertShoppingItem();
  const deleteItem = useDeleteShoppingItem();
  const purchase = usePurchaseShoppingItem();
  const clearPurchased = useDeleteAllPurchasedItems();
  const saveTemplate = useSaveShoppingTemplate();
  const deleteTemplate = useDeleteShoppingTemplate();
  const applyTemplate = useApplyShoppingTemplate();
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
      setShowClearPurchased(false);
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

  const handleApplyTemplate = async (template: ShoppingTemplateWithItems) => {
    setApplyingTemplateId(template.id);
    try {
      const result = await applyTemplate.mutateAsync(template);
      if (result.added === 0) {
        toast(t("templateAllExisting"), "success");
      } else {
        toast(t("templateApplied", { added: result.added, skipped: result.skipped }), "success");
      }
    } catch {
      // Error toast is handled by useApplyShoppingTemplate.onError
    } finally {
      setApplyingTemplateId(null);
    }
  };

  const handleSaveTemplate = async (input: {
    id?: string;
    name: string;
    items: { name: string; desired_units: number }[];
  }) => {
    // 失敗時は例外を伝播させ、パネル側でエディタを閉じずに入力内容を保持できるようにする (#521)。
    // エラートーストは useSaveShoppingTemplate.onError が表示する。
    await saveTemplate.mutateAsync(input);
    toast(t("templateSaved"), "success");
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      toast(t("templateDeleted"), "success");
    } catch {
      // Error toast is handled by useDeleteShoppingTemplate.onError
    }
  };

  const handleSortChange = (value: ShoppingSortKey) => {
    setSort(value);
    localStorage.setItem(SORT_STORAGE_KEY, value);
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

  // linked_item_id → カテゴリを解決するためのマップを構築する
  const itemCategoryIdMap = new Map(inventoryItems.map((i) => [i.id, i.category_id ?? null]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const resolveCategory: CategoryResolver = (shoppingItem) => {
    if (!shoppingItem.linked_item_id) return null;
    const categoryId = itemCategoryIdMap.get(shoppingItem.linked_item_id);
    if (!categoryId) return null;
    const category = categoryMap.get(categoryId);
    if (!category) return null;
    return { id: category.id, name: category.name, color: category.color ?? null };
  };

  const sortedItems = sortShoppingItems(items, sort, resolveCategory);
  const groups = sort === "category" ? groupShoppingItemsByCategory(items, resolveCategory) : null;

  const renderRow = (item: ShoppingItem) => (
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
  );

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
            variant={showTemplates ? "default" : "outline"}
            onClick={() => setShowTemplates((v) => !v)}
          >
            <LayoutList className="mr-1 h-4 w-4" />
            {t("templates")}
          </Button>
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

      {showTemplates && (
        <ShoppingTemplatesPanel
          templates={templates}
          onApply={(template) => {
            void handleApplyTemplate(template);
          }}
          onSave={handleSaveTemplate}
          onDelete={(id) => {
            void handleDeleteTemplate(id);
          }}
          isSaving={saveTemplate.isPending}
          applyingId={applyingTemplateId}
        />
      )}

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
              setEditId(null);
            }}
          >
            {t(tabLabelKey[s])}
          </button>
        ))}
      </div>

      {/* Sort / group control */}
      {items.length > 0 && (
        <div className="flex items-center justify-end gap-2">
          <label htmlFor="shopping-sort" className="text-xs text-muted-foreground">
            {t("sortLabel")}
          </label>
          <Select
            id="shopping-sort"
            className="h-8 w-auto"
            value={sort}
            onChange={(e) => {
              if (isShoppingSortKey(e.target.value)) handleSortChange(e.target.value);
            }}
          >
            {SHOPPING_SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {t(sortLabelKey[key])}
              </option>
            ))}
          </Select>
        </div>
      )}

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
      ) : groups ? (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.categoryId ?? "__other__"} className="space-y-2">
              <ShoppingGroupHeader
                name={group.categoryName}
                color={group.color}
                count={group.items.length}
                otherLabel={t("groupOther")}
              />
              {group.items.map(renderRow)}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">{sortedItems.map(renderRow)}</div>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/shopping")({
  component: ShoppingPage,
});
