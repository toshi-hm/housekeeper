import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Footprints, LayoutList, Plus, ScanLine, ShoppingCart } from "lucide-react";
import { useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ExpiryBadge } from "@/components/atoms/ExpiryBadge";
import { ShareButton } from "@/components/atoms/ShareButton";
import { Skeleton } from "@/components/atoms/Skeleton";
import { VoiceInputButton } from "@/components/atoms/VoiceInputButton";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { ScanToShoppingDialog } from "@/components/molecules/ScanToShoppingDialog";
import { ShoppingGroupHeader } from "@/components/molecules/ShoppingGroupHeader";
import { ShoppingRow } from "@/components/molecules/ShoppingRow";
import { BarcodeScanner } from "@/components/organisms/BarcodeScanner";
import {
  type ShoppingModeAlertEntry,
  ShoppingModeView,
} from "@/components/organisms/ShoppingModeView";
import { ShoppingTemplatesPanel } from "@/components/organisms/ShoppingTemplatesPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useBarcodeLookup } from "@/hooks/useBarcodeLookup";
import { downloadExternalImageAsFile, uploadItemImage } from "@/hooks/useItemImage";
import { findActiveItemByBarcode, useItems } from "@/hooks/useItems";
import { useCategories } from "@/hooks/useMasterData";
import { useRovingTabs } from "@/hooks/useRovingTabs";
import {
  QUERY_KEY as SHOPPING_QUERY_KEY,
  restoreShoppingItem,
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
import { useSpeechInput } from "@/hooks/useSpeechInput";
import { useForecastAlerts, useStorePriceComparisons } from "@/hooks/useStats";
import { useUndoableAction } from "@/hooks/useUndoableAction";
import { useUserSettings } from "@/hooks/useUserSettings";
import { parseLocalDate } from "@/lib/dateUtils";
import { OfflineError } from "@/lib/requireOnline";
import {
  type CategoryResolver,
  groupShoppingItemsByCategory,
  isShoppingSortKey,
  mergeLowStockAlerts,
  SHOPPING_SORT_KEYS,
  type ShoppingSortKey,
  sortShoppingItems,
} from "@/lib/shoppingView";
import { useToast } from "@/lib/toast-context";
import {
  DEFAULT_LOW_STOCK_FORECAST_DAYS,
  dropExpiryForDailyGoods,
  getExpiryStatus,
  type ItemFormValues,
  targetsExistingItem,
} from "@/types/item";
import type { ShoppingItem, ShoppingTemplateWithItems } from "@/types/shopping";

import { PurchaseDialog } from "../components/molecules/PurchaseDialog";

const SORT_STORAGE_KEY = "shopping.sort";
const SHOPPING_MODE_STORAGE_KEY = "shopping.mode";

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

const SHOPPING_TABS = ["planned", "purchased"] as const satisfies readonly ShoppingTab[];

const tabLabelKey = {
  planned: "statusPlanned",
  purchased: "statusPurchased",
} as const satisfies Record<ShoppingTab, string>;

export const ShoppingPage = () => {
  const { t, i18n } = useTranslation("shopping");
  const { t: tc } = useTranslation("common");
  const { toast } = useToast();
  const qc = useQueryClient();
  // 購入ダイアログ内の ItemForm で選択された画像。購入成功後にアップロードする (#453)
  const pendingPurchaseFileRef = useRef<File | null>(null);
  const pendingPurchaseImageUrlRef = useRef<string | null>(null);
  const [tab, setTab] = useState<ShoppingTab>("planned");
  const { tablistProps: shoppingTablistProps, getTabProps: getShoppingTabProps } = useRovingTabs(
    SHOPPING_TABS,
    tab,
    setTab,
  );
  const plannedTabId = useId();
  const purchasedTabId = useId();
  const shoppingTabIds = { planned: plannedTabId, purchased: purchasedTabId } as const;
  const activeShoppingTabId = shoppingTabIds[tab];
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
  // 買い物中モード（#926）: 買い物リスト・低在庫・期限間近を1画面に統合表示する。
  // トグル状態は端末に記憶しておき、次回訪問時も同じ表示で開く。
  const [shoppingMode, setShoppingMode] = useState(
    () => localStorage.getItem(SHOPPING_MODE_STORAGE_KEY) === "1",
  );
  const [addingAlertId, setAddingAlertId] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scanDraft, setScanDraft] = useState<ScanDraft | null>(null);
  const [isLooking, setIsLooking] = useState(false);
  const speechInput = useSpeechInput((transcript) => setAddName(transcript));

  const { data: items = [], isLoading } = useShoppingList(tab);
  const { data: plannedItems = [], isLoading: plannedItemsLoading } = useShoppingList("planned");
  const { data: templates = [] } = useShoppingTemplates();
  const { data: inventoryItems = [], isLoading: inventoryItemsLoading } = useItems();
  const { data: categories = [], isLoading: categoriesLoading } = useCategories();
  const { data: userSettings } = useUserSettings();
  const upsert = useUpsertShoppingItem();
  const deleteItem = useDeleteShoppingItem();
  const purchase = usePurchaseShoppingItem();
  const clearPurchased = useDeleteAllPurchasedItems();
  const saveTemplate = useSaveShoppingTemplate();
  const deleteTemplate = useDeleteShoppingTemplate();
  const applyTemplate = useApplyShoppingTemplate();
  const { lookup, error: lookupError } = useBarcodeLookup();

  // 買い物リストのアイテム削除の取り消し（#478）。shopping_list_items は
  // ソフトデリートを持たないため、Undo時は restoreShoppingItem で同じ内容を
  // 再insertする。
  const deleteUndo = useUndoableAction<ShoppingItem>({
    durationMs: 6000,
    message: () => t("deleteSuccess"),
    undoLabel: t("common:undo"),
    onUndo: async (_id, item) => {
      try {
        await restoreShoppingItem(item);
        await qc.invalidateQueries({ queryKey: [SHOPPING_QUERY_KEY] });
        toast(t("common:undoSuccess"), "success");
      } catch (err) {
        toast(
          err instanceof OfflineError ? t("common:offlineError") : t("common:unknownError"),
          "error",
        );
        throw err;
      }
    },
  });

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
    // Snapshot the full row before it's deleted so a later Undo can
    // re-insert it exactly (#478). Falls back to the "planned" list too,
    // since the delete confirm dialog can be triggered from either tab.
    const target =
      items.find((i) => i.id === deleteId) ?? plannedItems.find((i) => i.id === deleteId);
    try {
      await deleteItem.mutateAsync(deleteId);
      setDeleteId(null);
      // Success toast (with an Undo action) is shown by deleteUndo.start
      // when we have a snapshot to restore from; otherwise fall back to a
      // plain success toast.
      if (target) {
        deleteUndo.start(target.id, target);
      } else {
        toast(t("deleteSuccess"), "success");
      }
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

  const clearPendingPurchaseImage = () => {
    pendingPurchaseFileRef.current = null;
    pendingPurchaseImageUrlRef.current = null;
  };

  const handlePurchase = async (values: ItemFormValues, applyMergeFields: boolean) => {
    if (!pendingPurchaseId) return;
    const id = pendingPurchaseId;
    try {
      const newItem = await purchase.mutateAsync({
        shoppingItemId: id,
        itemValues: values,
        applyMergeFields,
      });

      // 購入で作成したアイテムに、ダイアログで選択された画像をアップロードする (#453)。
      // NewItemPage と同じく、アイテム作成後に itemId 指定で uploadItemImage する。
      // 既存アイテムへのスタック(_stacked)・復活(_revived)時はアップロードしない。既存アイテムの
      // 画像を選択画像で上書きしてしまうため（NewItemPage.tsx と同じガード、#650）。
      const pendingFile = pendingPurchaseFileRef.current;
      const pendingImageUrl = pendingPurchaseImageUrlRef.current;
      if ((pendingFile || pendingImageUrl) && !targetsExistingItem(newItem)) {
        try {
          const file =
            pendingFile ??
            (pendingImageUrl ? await downloadExternalImageAsFile(pendingImageUrl) : null);
          if (file) {
            await uploadItemImage({ itemId: newItem.id, file, queryClient: qc });
            await qc.invalidateQueries({ queryKey: ["items"] });
          }
        } catch (err) {
          toast(
            err instanceof OfflineError ? t("common:offlineError") : t("items:imageUploadFailed"),
            err instanceof OfflineError ? "error" : "warning",
          );
        }
      }

      clearPendingPurchaseImage();
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

  const handleToggleShoppingMode = () => {
    const next = !shoppingMode;
    setShoppingMode(next);
    localStorage.setItem(SHOPPING_MODE_STORAGE_KEY, next ? "1" : "0");
  };

  const handleAddAlertToList = async (entry: ShoppingModeAlertEntry) => {
    setAddingAlertId(entry.id);
    try {
      await upsert.mutateAsync({ name: entry.name, linked_item_id: entry.id });
      toast(t("restockSuccess"), "success");
    } catch {
      // Error toast is handled by useUpsertShoppingItem.onError
    } finally {
      setAddingAlertId(null);
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

  // #830: 購入ダイアログを開いている対象の shopping_list_items 行（名前・
  // linked_item_id の参照に使う）
  const pendingPurchaseShoppingItem = plannedItems.find((i) => i.id === pendingPurchaseId);
  // #830 / #879セルフレビュー: linked_item_id で既存アイテムへ統合されることが
  // 事前に分かる場合のみ、フォームに既存値を初期表示する。inventoryItems は
  // アクティブなアイテムのみを保持している（ソフトデリート済みへの復活統合は
  // このページで未取得のため対象外、この場合はフォームは従来通り空欄で始まる）。
  // バーコード一致による統合は購入完了時にしか判明しないため同様に対象外。
  // この値が non-null のときだけ items 側の update へフォーム入力を反映する
  // (`applyMergeFields`)。プリフィルされていないパスで反映すると、空欄を
  // そのまま書き込んで既存のカテゴリ/保管場所/メモ等を消してしまうため。
  const pendingPurchaseExistingItem = pendingPurchaseShoppingItem?.linked_item_id
    ? (inventoryItems.find((i) => i.id === pendingPurchaseShoppingItem.linked_item_id) ?? null)
    : null;

  // linked_item_id → カテゴリを解決するためのマップを構築する
  const itemCategoryIdMap = new Map(inventoryItems.map((i) => [i.id, i.category_id ?? null]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  // linked_item_id → 最安店舗（#697の集計を再利用、#854）。stores は安い順に
  // ソート済みのため先頭が最安値。
  const { data: storePriceComparisons = [] } = useStorePriceComparisons();
  const cheapestStoreByItemId = new Map(
    storePriceComparisons
      .filter((c) => c.stores.length > 0)
      .map((c) => [c.itemId, c.stores[0]] as const),
  );
  const resolveCheapestStore = (shoppingItem: ShoppingItem) =>
    shoppingItem.linked_item_id
      ? (cheapestStoreByItemId.get(shoppingItem.linked_item_id) ?? null)
      : null;
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

  // 買い物中モード（#926）: ダッシュボード（`_auth.index.tsx`）と同じ算出ロジックを
  // 再利用する。minimum_stock ベースのアラートは既に取得済みの inventoryItems から
  // 算出するため新規フェッチはないが、消費ペース予測（#392）は consumption_logs の
  // 追加フェッチを伴うため、買い物中モード表示時のみ取得する。日用品は期限を扱わない
  // (`dropExpiryForDailyGoods`, #937) ため、期限間近セクションには出さない。
  const warningDays = userSettings?.expiry_warning_days;
  const inventoryItemsForMode = dropExpiryForDailyGoods(
    inventoryItems,
    Object.fromEntries(categories.map((c) => [c.id, c])),
  );
  const minimumStockAlerts: ShoppingModeAlertEntry[] = inventoryItemsForMode
    .filter(
      (item) =>
        item.minimum_stock !== null &&
        item.minimum_stock !== undefined &&
        item.units <= item.minimum_stock,
    )
    .map((item) => ({
      id: item.id,
      name: item.name,
      detail: t("shoppingModeLowStockDetail", { units: item.units, minimum: item.minimum_stock }),
    }));
  // 消費ペースからの予測残日数ベースの低在庫アラート（#392）。ダッシュボードと同様、
  // 既に minimum_stock ベースのアラートに載っているアイテムは重複表示しない（#978）。
  const forecastThresholdDays =
    userSettings?.low_stock_forecast_days ?? DEFAULT_LOW_STOCK_FORECAST_DAYS;
  const { alerts: forecastAlerts, isLoading: forecastAlertsLoading } = useForecastAlerts(
    inventoryItems,
    forecastThresholdDays,
    { enabled: shoppingMode },
  );
  const lowStockAlerts: ShoppingModeAlertEntry[] = mergeLowStockAlerts(
    minimumStockAlerts,
    forecastAlerts,
    inventoryItems,
    (item, predictedRemainingDays) => ({
      id: item.id,
      name: item.name,
      detail: t("shoppingModeLowStockForecastDetail", { days: predictedRemainingDays }),
    }),
  );
  const expiringAlerts: ShoppingModeAlertEntry[] = inventoryItemsForMode
    .filter((item) => {
      const status = getExpiryStatus(item.expiry_date, warningDays);
      return (status === "expired" || status === "expiring-soon") && item.units > 0;
    })
    .map((item) => ({
      id: item.id,
      name: item.name,
      detail: item.expiry_date
        ? parseLocalDate(item.expiry_date).toLocaleDateString(i18n.language)
        : undefined,
      badge: (
        <ExpiryBadge
          expiryDate={item.expiry_date}
          warningDays={warningDays}
          expiryType={item.expiry_type}
        />
      ),
    }));
  const addedAlertItemIds = new Set(
    plannedItems.flatMap((item) => (item.linked_item_id ? [item.linked_item_id] : [])),
  );
  // 買い物中モード（#977, #986）: 元データ未取得の間に「確認事項なし」を誤表示しないための
  // ローディング判定。消費ペース予測（#392, #985）の取得は shoppingMode が true の間だけ走るため、
  // shoppingMode が false のときはこの判定に含めない（未取得のまま常時 loading にならないように）。
  const shoppingModeLoading =
    plannedItemsLoading ||
    inventoryItemsLoading ||
    categoriesLoading ||
    (shoppingMode && forecastAlertsLoading);

  const renderRow = (item: ShoppingItem) => (
    <ShoppingRow
      key={item.id}
      id={item.id}
      name={item.name}
      desiredUnits={item.desired_units}
      note={item.note}
      isPurchased={item.status === "purchased"}
      isAutoAdded={item.auto_added}
      cheapestStore={resolveCheapestStore(item)}
      isEditing={editId === item.id}
      isSaving={savingId === item.id}
      onPurchase={
        tab === "planned"
          ? (id) => {
              clearPendingPurchaseImage();
              setPendingPurchaseId(id);
            }
          : undefined
      }
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
          itemName={pendingPurchaseShoppingItem?.name}
          existingItem={pendingPurchaseExistingItem}
          onSubmit={(values) => {
            void handlePurchase(values, !!pendingPurchaseExistingItem);
          }}
          onClose={() => {
            if (!purchase.isPending) {
              clearPendingPurchaseImage();
              setPendingPurchaseId(null);
            }
          }}
          isSubmitting={purchase.isPending}
          onPendingFileChange={(file) => {
            pendingPurchaseFileRef.current = file;
          }}
          onPendingImageUrlChange={(url) => {
            pendingPurchaseImageUrlRef.current = url;
          }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-6 w-6" />
          <h1 className="text-2xl font-bold">{t("title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={shoppingMode ? "default" : "outline"}
            onClick={handleToggleShoppingMode}
            aria-pressed={shoppingMode}
          >
            <Footprints className="mr-1 h-4 w-4" />
            {t("shoppingMode")}
          </Button>
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
            aria-expanded={showTemplates}
            aria-controls="shopping-templates-panel"
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
          <Button
            size="sm"
            onClick={() => setShowAdd((v) => !v)}
            aria-expanded={showAdd}
            aria-controls="shopping-add-form"
          >
            <Plus className="mr-1 h-4 w-4" />
            {t("addItem")}
          </Button>
        </div>
      </div>

      {showTemplates && (
        <div id="shopping-templates-panel">
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
            isDeleting={deleteTemplate.isPending}
            applyingId={applyingTemplateId}
          />
        </div>
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
        // 在庫一致パスは lookup() を呼ばないため、直前の無関係な検索エラーが
        // フックに残っていても matchedExisting 時は表示しない (#851)
        errorType={scanDraft && !scanDraft.matchedExisting ? lookupError : null}
        isSubmitting={upsert.isPending}
        onConfirm={(name) => {
          void handleScanConfirm(name);
        }}
        onClose={() => setScanDraft(null)}
      />

      {/* Add form */}
      {showAdd && (
        <div id="shopping-add-form" className="space-y-3 rounded-lg border p-4">
          <div className="space-y-1">
            <Label htmlFor="add-name">{t("itemName")}</Label>
            <div className="flex gap-2">
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
              <VoiceInputButton
                isSupported={speechInput.isSupported}
                isListening={speechInput.isListening}
                onStart={speechInput.start}
                label={tc("voiceInput")}
                listeningLabel={tc("voiceInputListening")}
              />
            </div>
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

      {shoppingMode ? (
        <ShoppingModeView
          plannedItems={plannedItems}
          onPurchase={(id) => {
            clearPendingPurchaseImage();
            setPendingPurchaseId(id);
          }}
          onDelete={(id) => setDeleteId(id)}
          lowStockItems={lowStockAlerts}
          expiringItems={expiringAlerts}
          addedItemIds={addedAlertItemIds}
          onAddAlert={(entry) => {
            void handleAddAlertToList(entry);
          }}
          addingItemId={addingAlertId}
          isLoading={shoppingModeLoading}
          resolveCheapestStore={resolveCheapestStore}
        />
      ) : (
        <>
          {/* Tabs */}
          <div className="flex rounded-lg border p-1" role="tablist" {...shoppingTablistProps}>
            {SHOPPING_TABS.map((s) => (
              <button
                key={s}
                id={shoppingTabIds[s]}
                role="tab"
                aria-selected={tab === s}
                aria-controls={`${shoppingTabIds[s]}-panel`}
                {...getShoppingTabProps(s)}
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

          <div
            id={`${activeShoppingTabId}-panel`}
            role="tabpanel"
            aria-labelledby={activeShoppingTabId}
            tabIndex={0}
            className="space-y-4"
          >
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
        </>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/shopping")({
  component: ShoppingPage,
});
