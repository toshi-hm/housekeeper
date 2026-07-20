import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckSquare,
  ChefHat,
  Plus,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Skeleton } from "@/components/atoms/Skeleton";
import { ViewModeToggle } from "@/components/atoms/ViewModeToggle";
import { BulkActionBar } from "@/components/molecules/BulkActionBar";
import { BulkMoveDialog } from "@/components/molecules/BulkMoveDialog";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { ItemCard } from "@/components/molecules/ItemCard";
import { ItemListRow } from "@/components/molecules/ItemListRow";
import { QuickMemoSheet } from "@/components/molecules/QuickMemoSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAutoArchiveExpiredItems } from "@/hooks/useAutoArchive";
import { useConsumeItem } from "@/hooks/useConsumeItem";
import { useSignedItemImages } from "@/hooks/useItemImage";
import {
  type BulkAction,
  type ItemFilters,
  type ItemSortKey,
  useBulkItemAction,
  useItems,
  useUpdateItem,
} from "@/hooks/useItems";
import { useCategories, useStorageLocations } from "@/hooks/useMasterData";
import { useUpsertShoppingItem } from "@/hooks/useShoppingList";
import { useForecastAlerts } from "@/hooks/useStats";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useViewMode } from "@/hooks/useViewMode";
import { updateAppBadge } from "@/lib/pwa";
import { toggleId, toggleSelectAll } from "@/lib/selection";
import { useToast } from "@/lib/toast-context";
import {
  DEFAULT_LOW_STOCK_FORECAST_DAYS,
  DEFAULT_STOCKTAKE_ALERT_DAYS,
  getExpiryStatus,
  isItemUnverified,
  type Item,
} from "@/types/item";

const PAGE_SIZE = 40;

const dashboardSearchSchema = z.object({
  q: z.string().optional().default(""),
  cat: z.string().optional().default(""),
  loc: z.string().optional().default(""),
  expiry: z.string().optional().default(""),
});

const SEARCH_DEBOUNCE_MS = 300;

interface SearchInputProps {
  value: string;
  placeholder: string;
  onDebouncedChange: (value: string) => void;
}

/**
 * キー入力ごとのURL遷移/Supabase再クエリを避けるため、ローカルstateで入力を受けてからデバウンスする。
 *
 * 以前は親で `key={value}` を指定して外部変化(戻る/進む等)に再マウントで追従していたが、
 * デバウンス確定 → URL更新 → key変化 で入力中にコンポーネントが毎回作り直され、
 * フォーカスが外れて入力を継続できず、IME変換中は文字が重複する不具合があった (#527)。
 *
 * そのため再マウントはやめ、以下で追従する:
 * - IME変換中 (isComposing) はデバウンス発火を抑止し、変換確定時にまとめて反映する
 * - 自分が発火した更新の「エコー」はスキップし、外部要因の変化のみローカルstateへ同期する
 */
const SearchInput = ({
  value: externalValue,
  placeholder,
  onDebouncedChange,
}: SearchInputProps) => {
  const [value, setValue] = useState(externalValue);
  const isComposingRef = useRef(false);
  // 最後に emit / 同期した値。自分の更新のエコーと外部変化を区別するために使う
  const lastSyncedRef = useRef(externalValue);
  // IME変換確定を検知するためのカウンタ。React 19 は変換中も onChange を発火するため、
  // 確定時の値が変換中の最終値と同一になり setValue が bail-out してデバウンスが動かない。
  // 確定のたびにこの値を増やして、値が同一でもデバウンスeffectを再実行させる。
  const [compositionSeq, setCompositionSeq] = useState(0);

  // 戻る/進む等の外部要因でURLのsearchが変わったときだけローカルstateへ同期する。
  // 自分がemitした値のエコー (externalValue === lastSyncedRef) では上書きしない。
  useEffect(() => {
    if (externalValue !== lastSyncedRef.current) {
      lastSyncedRef.current = externalValue;
      setValue(externalValue);
    }
  }, [externalValue]);

  useEffect(() => {
    // IME変換中はまだ確定していないため、デバウンス発火しない
    if (isComposingRef.current) return;
    if (value === lastSyncedRef.current) return;
    const timer = setTimeout(() => {
      lastSyncedRef.current = value;
      onDebouncedChange(value);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, compositionSeq]);

  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9"
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={(e) => {
          isComposingRef.current = false;
          // 変換確定後の値でstateを更新し、デバウンスeffectを発火させる。
          // 値が変換中の最終値と同一でも、compositionSeq を増やして確実に再発火させる。
          setValue(e.currentTarget.value);
          setCompositionSeq((n) => n + 1);
        }}
      />
    </div>
  );
};

export const DashboardPage = () => {
  const { t } = useTranslation("items");
  const { t: tc } = useTranslation("common");
  const { data: categories = [] } = useCategories();
  const { data: locations = [] } = useStorageLocations();
  const { data: userSettings } = useUserSettings();
  const warningDays = userSettings?.expiry_warning_days;
  useAutoArchiveExpiredItems(userSettings?.auto_archive_after_days);
  const consumeItem = useConsumeItem();
  const upsertShoppingItem = useUpsertShoppingItem();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isBulkAdding, setIsBulkAdding] = useState(false);

  const { q: search, cat: categoryId, loc: locationId, expiry: expiryFilter } = Route.useSearch();

  const setSearch = (v: string) =>
    void navigate({ to: "/", search: (prev) => ({ ...prev, q: v }), replace: true });
  const setCategoryId = (v: string) =>
    void navigate({ to: "/", search: (prev) => ({ ...prev, cat: v }), replace: true });
  const setLocationId = (v: string) =>
    void navigate({ to: "/", search: (prev) => ({ ...prev, loc: v }), replace: true });
  const setExpiryFilter = (v: string) =>
    void navigate({ to: "/", search: (prev) => ({ ...prev, expiry: v }), replace: true });

  const [sort, setSort] = useState<ItemSortKey>(
    () => (localStorage.getItem("dashboard.sort") as ItemSortKey) ?? "created_at",
  );
  const [showFilters, setShowFilters] = useState(false);
  const { viewMode, setViewMode } = useViewMode();
  const [hideEmpty, setHideEmpty] = useState(() => {
    const saved = localStorage.getItem("dashboard.hideEmpty");
    return saved !== null ? saved === "true" : true;
  });
  const [quickConsumingId, setQuickConsumingId] = useState<string | null>(null);

  // クイックメモ（#380）
  const [memoItem, setMemoItem] = useState<Item | null>(null);
  const updateMemoItem = useUpdateItem(memoItem?.id ?? "");

  const handleSaveMemo = (notes: string) => {
    if (!memoItem) return;
    updateMemoItem.mutate(
      { notes },
      {
        onSuccess: () => {
          toast(t("quickMemoSuccess"), "success");
          setMemoItem(null);
        },
      },
    );
  };

  // 一括操作（#359）
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMoveDialog, setBulkMoveDialog] = useState<"location" | "category" | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<"consume" | "delete" | null>(null);
  const bulkAction = useBulkItemAction();

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkMoveDialog(null);
    setBulkConfirm(null);
  };

  const runBulkAction = async (action: BulkAction, targetId?: string | null) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    try {
      await bulkAction.mutateAsync({ action, ids, targetId });
      exitSelectionMode();
    } catch {
      // Error toast is handled by useBulkItemAction.onError
    }
  };

  const handleQuickConsume = async (item: Item) => {
    if (quickConsumingId) return;
    setQuickConsumingId(item.id);
    try {
      await consumeItem.mutateAsync({ item, deltaAmount: item.content_amount });
      toast(t("quickConsumeSuccess", { name: item.name }), "success");
    } catch {
      // Error toast is handled by useConsumeItem.onError
    } finally {
      setQuickConsumingId(null);
    }
  };

  const filters: ItemFilters = {
    search: search || undefined,
    categoryId: categoryId || undefined,
    storageLocationId: locationId || undefined,
  };

  // Alerts must not disappear when the visible list is narrowed by search,
  // category, location, expiry, sorting, or the hide-empty preference.
  const { data: allItems = [] } = useItems({}, "created_at");
  const { data: items = [], isLoading, error } = useItems(filters, sort);

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const locationMap = Object.fromEntries(locations.map((l) => [l.id, l.name]));

  const baseFiltered = items.filter((item) => !hideEmpty || item.units > 0);

  const filtered = baseFiltered.filter((item) => {
    if (expiryFilter && expiryFilter !== "all") {
      const status = getExpiryStatus(item.expiry_date, warningDays);
      if (status !== expiryFilter) return false;
    }
    return true;
  });

  const filtersKey = `${search}|${categoryId}|${locationId}|${expiryFilter}|${hideEmpty}|${sort}`;
  const [prevFiltersKey, setPrevFiltersKey] = useState(filtersKey);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Reset pagination when filters change (render-phase state update per React docs)
  if (prevFiltersKey !== filtersKey) {
    setPrevFiltersKey(filtersKey);
    setDisplayCount(PAGE_SIZE);
  }

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setDisplayCount((prev) => Math.min(prev + PAGE_SIZE, filtered.length));
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filtered.length]);

  const visibleItems = filtered.slice(0, displayCount);
  const { data: imageUrlsByPath } = useSignedItemImages(
    viewMode === "grid" ? visibleItems.map((item) => item.image_path) : [],
  );

  // 期限バナー（見出し件数・アコーディオン内訳・一括追加ボタン）は在庫が残っている
  // (units > 0) 期限切れ/期限間近アイテムのみを対象にする。見出しの urgentCount も
  // この units > 0 の集合から算出し、内訳・ボタン対象と件数を一致させる (#450)。
  const urgentItems = items.filter((item) => {
    const status = getExpiryStatus(item.expiry_date, warningDays);
    return (status === "expired" || status === "expiring-soon") && item.units > 0;
  });
  const expiredItems = urgentItems.filter(
    (item) => getExpiryStatus(item.expiry_date, warningDays) === "expired",
  );
  const expiringSoonItems = urgentItems.filter(
    (item) => getExpiryStatus(item.expiry_date, warningDays) === "expiring-soon",
  );
  const urgentCount = urgentItems.length;

  useEffect(() => {
    void updateAppBadge(urgentCount);
  }, [urgentCount]);

  // クイックフィルターチップの件数。チップをタップしたときに表示される filtered
  // (baseFiltered を期限状態で絞ったもの) と一致させるため baseFiltered 基準で数える。
  const expiredCount = baseFiltered.filter(
    (item) => getExpiryStatus(item.expiry_date, warningDays) === "expired",
  ).length;
  const expiringSoonCount = baseFiltered.filter(
    (item) => getExpiryStatus(item.expiry_date, warningDays) === "expiring-soon",
  ).length;

  const lowStockItems = baseFiltered.filter(
    (item) =>
      item.minimum_stock !== null &&
      item.minimum_stock !== undefined &&
      item.units <= item.minimum_stock,
  );

  // 消費ペースからの予測残日数が閾値以内のアイテム（#392）。既に minimum_stock ベースの
  // 低在庫バナーに載っているアイテムは重複表示しない（補完する）。
  const lowStockIds = new Set(lowStockItems.map((item) => item.id));
  const forecastThresholdDays =
    userSettings?.low_stock_forecast_days ?? DEFAULT_LOW_STOCK_FORECAST_DAYS;
  const { alerts: forecastAlerts } = useForecastAlerts(baseFiltered, forecastThresholdDays);
  const forecastAlertItems = forecastAlerts
    .filter((forecastAlert) => !lowStockIds.has(forecastAlert.itemId))
    .map((forecastAlert) => ({
      forecastAlert,
      item: baseFiltered.find((item) => item.id === forecastAlert.itemId),
    }))
    .filter((entry): entry is { forecastAlert: (typeof forecastAlerts)[number]; item: Item } =>
      Boolean(entry.item),
    );

  // 棚卸し（在庫確認）未確認アラート (#375)
  const stocktakeAlertEnabled = userSettings?.stocktake_alert_enabled ?? false;
  const stocktakeAlertDays = userSettings?.stocktake_alert_days ?? DEFAULT_STOCKTAKE_ALERT_DAYS;
  const unverifiedItems = stocktakeAlertEnabled
    ? allItems.filter((item) => item.units > 0 && isItemUnverified(item, stocktakeAlertDays))
    : [];

  const handleBulkAddToShopping = async () => {
    if (isBulkAdding) return;
    setIsBulkAdding(true);
    try {
      await Promise.all(
        urgentItems.map((item) =>
          upsertShoppingItem.mutateAsync({
            name: item.name,
            linked_item_id: item.id,
            desired_units: 1,
          }),
        ),
      );
      toast(t("bulkAddToShoppingSuccess", { count: urgentItems.length }), "success");
      void navigate({ to: "/shopping" });
    } catch {
      // Error toast handled by useUpsertShoppingItem.onError
    } finally {
      setIsBulkAdding(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length === baseFiltered.length
              ? t("itemCountLabel", { count: baseFiltered.length })
              : t("itemCountLabelFiltered", {
                  filtered: filtered.length,
                  total: baseFiltered.length,
                })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectionMode ? (
            <Button size="sm" variant="outline" onClick={exitSelectionMode}>
              <X className="mr-1 h-4 w-4" />
              {tc("cancel")}
            </Button>
          ) : (
            <>
              {items.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setSelectionMode(true)}>
                  <CheckSquare className="mr-1 h-4 w-4" />
                  {t("bulkSelect")}
                </Button>
              )}
              <Link to="/recipes">
                <Button size="sm" variant="outline">
                  <ChefHat className="mr-1 h-4 w-4" />
                  {t("recipes:recipesShortcut")}
                </Button>
              </Link>
              <Link to="/items/new">
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" />
                  {t("addItem")}
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Selection mode sub-header */}
      {selectionMode && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">
            {t("bulkSelectedCount", { count: selectedIds.size })}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              setSelectedIds(
                toggleSelectAll(
                  selectedIds,
                  filtered.map((i) => i.id),
                ),
              )
            }
          >
            {selectedIds.size === filtered.length ? t("bulkDeselectAll") : t("bulkSelectAll")}
          </Button>
        </div>
      )}

      {/* Expiry alert banner */}
      {urgentCount > 0 && (
        <div className="space-y-3 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-yellow-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm">
              <span className="font-medium">{t("urgentBanner", { count: urgentCount })}</span>
            </p>
          </div>
          <details className="rounded-md border border-yellow-200 bg-yellow-100/50 p-2">
            <summary className="cursor-pointer text-sm font-medium">
              {t("urgentBannerDetails")}
            </summary>
            <div className="mt-3 space-y-3 text-sm">
              <div>
                <p className="mb-1 font-medium">{t("expiryStatus.expired")}</p>
                {expiredItems.length === 0 ? (
                  <p className="text-xs text-yellow-700">{t("urgentBannerNoExpiredItems")}</p>
                ) : (
                  <ul className="list-inside list-disc space-y-1">
                    {expiredItems.map((item) => (
                      <li key={item.id}>
                        <Link
                          className="underline decoration-yellow-800 underline-offset-2 hover:opacity-80"
                          to="/items/$itemId"
                          params={{ itemId: item.id }}
                        >
                          {item.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-1 font-medium">{t("expiryStatus.expiring-soon")}</p>
                {expiringSoonItems.length === 0 ? (
                  <p className="text-xs text-yellow-700">{t("urgentBannerNoExpiringSoonItems")}</p>
                ) : (
                  <ul className="list-inside list-disc space-y-1">
                    {expiringSoonItems.map((item) => (
                      <li key={item.id}>
                        <Link
                          className="underline decoration-yellow-800 underline-offset-2 hover:opacity-80"
                          to="/items/$itemId"
                          params={{ itemId: item.id }}
                        >
                          {item.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </details>
          {urgentItems.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="w-full border-yellow-400 bg-yellow-50 text-yellow-800 hover:bg-yellow-100"
              onClick={() => void handleBulkAddToShopping()}
              disabled={isBulkAdding}
            >
              <ShoppingCart className="mr-1.5 h-4 w-4" />
              {isBulkAdding ? tc("loading") : t("bulkAddToShopping", { count: urgentItems.length })}
            </Button>
          )}
        </div>
      )}

      {/* Low-stock alert banner */}
      {lowStockItems.length > 0 && (
        <div className="space-y-2 rounded-lg border border-orange-300 bg-orange-50 p-3 text-orange-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">
              {t("lowStockBanner", { count: lowStockItems.length })}
            </p>
          </div>
          <details className="rounded-md border border-orange-200 bg-orange-100/50 p-2">
            <summary className="cursor-pointer text-sm font-medium">
              {t("lowStockBannerDetails")}
            </summary>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
              {lowStockItems.map((item) => (
                <li key={item.id}>
                  <Link
                    className="underline decoration-orange-800 underline-offset-2 hover:opacity-80"
                    to="/items/$itemId"
                    params={{ itemId: item.id }}
                  >
                    {item.name} ({item.units} / {item.minimum_stock})
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {/* Consumption-pace forecast banner (#392) */}
      {forecastAlertItems.length > 0 && (
        <div className="space-y-2 rounded-lg border border-blue-300 bg-blue-50 p-3 text-blue-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">
              {t("forecastAlertBanner", { count: forecastAlertItems.length })}
            </p>
          </div>
          <details className="rounded-md border border-blue-200 bg-blue-100/50 p-2">
            <summary className="cursor-pointer text-sm font-medium">
              {t("forecastAlertBannerDetails")}
            </summary>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
              {forecastAlertItems.map(({ forecastAlert, item }) => (
                <li key={item.id}>
                  <Link
                    className="underline decoration-blue-800 underline-offset-2 hover:opacity-80"
                    to="/items/$itemId"
                    params={{ itemId: item.id }}
                  >
                    {t("forecastAlertItemLine", {
                      name: item.name,
                      days: forecastAlert.predictedRemainingDays,
                    })}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {/* 棚卸し（在庫確認）未確認アラート (#375) */}
      {unverifiedItems.length > 0 && (
        <div className="space-y-2 rounded-lg border border-blue-300 bg-blue-50 p-3 text-blue-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <p className="text-sm font-medium">
              {t("stocktakeBanner", { count: unverifiedItems.length })}
            </p>
          </div>
          <details className="rounded-md border border-blue-200 bg-blue-100/50 p-2">
            <summary className="cursor-pointer text-sm font-medium">
              {t("stocktakeBannerDetails")}
            </summary>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
              {unverifiedItems.map((item) => (
                <li key={item.id}>
                  <Link
                    className="underline decoration-blue-800 underline-offset-2 hover:opacity-80"
                    to="/items/$itemId"
                    params={{ itemId: item.id }}
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <SearchInput
          value={search}
          placeholder={t("searchPlaceholder")}
          onDebouncedChange={setSearch}
        />
        <Button
          variant={showFilters ? "default" : "outline"}
          size="icon"
          onClick={() => setShowFilters((v) => !v)}
          aria-label={tc("filter")}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </div>

      {/* Quick filter chips */}
      {(expiredCount > 0 || expiringSoonCount > 0) && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setExpiryFilter("")}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              !expiryFilter || expiryFilter === "all"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background text-foreground hover:bg-muted"
            }`}
          >
            {t("quickFilterAll")} ({baseFiltered.length})
          </button>
          {expiredCount > 0 && (
            <button
              onClick={() => setExpiryFilter(expiryFilter === "expired" ? "" : "expired")}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                expiryFilter === "expired"
                  ? "border-destructive bg-destructive text-destructive-foreground"
                  : "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/20"
              }`}
            >
              {t("expiryStatus.expired")} ({expiredCount})
            </button>
          )}
          {expiringSoonCount > 0 && (
            <button
              onClick={() =>
                setExpiryFilter(expiryFilter === "expiring-soon" ? "" : "expiring-soon")
              }
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                expiryFilter === "expiring-soon"
                  ? "border-yellow-600 bg-yellow-500 text-white"
                  : "border-yellow-400/50 bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
              }`}
            >
              {t("expiryStatus.expiring-soon")} ({expiringSoonCount})
            </button>
          )}
        </div>
      )}

      {/* Filter panel */}
      {showFilters && (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t("filterByCategory")}
              </label>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">{tc("all")}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t("filterByLocation")}
              </label>
              <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">{tc("all")}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t("filterByExpiry")}
              </label>
              <Select value={expiryFilter} onChange={(e) => setExpiryFilter(e.target.value)}>
                <option value="">{tc("all")}</option>
                <option value="expired">{t("expiryStatus.expired")}</option>
                <option value="expiring-soon">{t("expiryStatus.expiring-soon")}</option>
                <option value="ok">{t("expiryStatus.ok")}</option>
                <option value="unknown">{t("expiryStatus.unknown")}</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{tc("sort")}</label>
              <Select
                value={sort}
                onChange={(e) => {
                  const v = e.target.value as ItemSortKey;
                  setSort(v);
                  localStorage.setItem("dashboard.sort", v);
                }}
              >
                <option value="created_at">{t("sortByCreatedAt")}</option>
                <option value="expiry_date">{t("sortByExpiry")}</option>
                <option value="purchase_date">{t("sortByPurchaseDate")}</option>
              </Select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(e) => {
                setHideEmpty(e.target.checked);
                localStorage.setItem("dashboard.hideEmpty", String(e.target.checked));
              }}
              className="rounded"
            />
            {t("hideEmpty")}
          </label>
        </div>
      )}

      {/* Loading / Error / Content */}
      {isLoading ? (
        viewMode === "grid" ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-lg border p-3">
                <Skeleton className="aspect-square w-full rounded-md" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full rounded-lg" />
            ))}
          </div>
        )
      ) : error ? (
        <div className="rounded-lg border border-destructive p-4 text-sm text-destructive">
          {t("loadError")}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          {items.length === 0 ? (
            <>
              <p className="text-lg font-medium">{t("noItems")}</p>
              <p className="mt-1 text-sm">{t("firstAddHint")}</p>
              <Link to="/items/new" className="mt-4">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("addItem")}
                </Button>
              </Link>
            </>
          ) : (
            <p className="text-lg font-medium">{t("noMatchingItems")}</p>
          )}
        </div>
      ) : (
        <>
          {viewMode === "grid" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visibleItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  categoryName={item.category_id ? categoryMap[item.category_id] : undefined}
                  locationName={
                    item.storage_location_id ? locationMap[item.storage_location_id] : undefined
                  }
                  warningDays={warningDays}
                  isQuickConsuming={quickConsumingId === item.id}
                  quickConsumeDisabled={quickConsumingId !== null && quickConsumingId !== item.id}
                  onQuickConsume={(i) => {
                    void handleQuickConsume(i);
                  }}
                  onQuickMemo={(i) => setMemoItem(i)}
                  imageUrl={item.image_path ? imageUrlsByPath?.[item.image_path] : undefined}
                  selectionMode={selectionMode}
                  isSelected={selectedIds.has(item.id)}
                  onToggleSelect={(i) => setSelectedIds(toggleId(selectedIds, i.id))}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {visibleItems.map((item) => (
                <ItemListRow
                  key={item.id}
                  item={item}
                  warningDays={warningDays}
                  selectionMode={selectionMode}
                  isSelected={selectedIds.has(item.id)}
                  onToggleSelect={(i) => setSelectedIds(toggleId(selectedIds, i.id))}
                />
              ))}
            </div>
          )}
          <div ref={sentinelRef} className="h-1" />
        </>
      )}

      {/* Bulk operation bar & dialogs (#359) */}
      {selectionMode && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          disabled={bulkAction.isPending}
          onChangeLocation={() => setBulkMoveDialog("location")}
          onChangeCategory={() => setBulkMoveDialog("category")}
          onConsume={() => setBulkConfirm("consume")}
          onDelete={() => setBulkConfirm("delete")}
        />
      )}

      <BulkMoveDialog
        open={bulkMoveDialog === "location"}
        title={t("bulkChangeLocation")}
        noneLabel={t("bulkNoneOption")}
        confirmLabel={tc("save")}
        cancelLabel={tc("cancel")}
        options={locations.map((l) => ({ id: l.id, name: l.name }))}
        isSubmitting={bulkAction.isPending}
        onConfirm={(targetId) => {
          setBulkMoveDialog(null);
          void runBulkAction("updateLocation", targetId);
        }}
        onClose={() => setBulkMoveDialog(null)}
      />
      <BulkMoveDialog
        open={bulkMoveDialog === "category"}
        title={t("bulkChangeCategory")}
        noneLabel={t("bulkNoneOption")}
        confirmLabel={tc("save")}
        cancelLabel={tc("cancel")}
        options={categories.map((c) => ({ id: c.id, name: c.name }))}
        isSubmitting={bulkAction.isPending}
        onConfirm={(targetId) => {
          setBulkMoveDialog(null);
          void runBulkAction("updateCategory", targetId);
        }}
        onClose={() => setBulkMoveDialog(null)}
      />
      <ConfirmDialog
        open={bulkConfirm === "consume"}
        title={t("bulkConsume")}
        message={t("bulkConsumeConfirm", { count: selectedIds.size })}
        confirmLabel={t("bulkConsume")}
        isConfirming={bulkAction.isPending}
        onConfirm={() => {
          setBulkConfirm(null);
          void runBulkAction("consume");
        }}
        onCancel={() => setBulkConfirm(null)}
      />
      <ConfirmDialog
        open={bulkConfirm === "delete"}
        title={t("bulkDelete")}
        message={t("bulkDeleteConfirm", { count: selectedIds.size })}
        confirmLabel={tc("delete")}
        variant="destructive"
        isConfirming={bulkAction.isPending}
        onConfirm={() => {
          setBulkConfirm(null);
          void runBulkAction("delete");
        }}
        onCancel={() => setBulkConfirm(null)}
      />

      <QuickMemoSheet
        open={memoItem !== null}
        itemName={memoItem?.name ?? ""}
        initialNotes={memoItem?.notes ?? ""}
        isSubmitting={updateMemoItem.isPending}
        onSave={handleSaveMemo}
        onClose={() => setMemoItem(null)}
      />
    </div>
  );
};

export const Route = createFileRoute("/_auth/")({
  validateSearch: dashboardSearchSchema,
  component: DashboardPage,
});
