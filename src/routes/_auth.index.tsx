import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Plus, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { Skeleton } from "@/components/atoms/Skeleton";
import { ItemCard } from "@/components/molecules/ItemCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useConsumeItem } from "@/hooks/useConsumeItem";
import { type ItemFilters, type ItemSortKey, useItems } from "@/hooks/useItems";
import { useCategories, useStorageLocations } from "@/hooks/useMasterData";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useToast } from "@/lib/toast-context";
import { getExpiryStatus, type Item } from "@/types/item";

const PAGE_SIZE = 40;

const dashboardSearchSchema = z.object({
  q: z.string().optional().default(""),
  cat: z.string().optional().default(""),
  loc: z.string().optional().default(""),
  expiry: z.string().optional().default(""),
});

const DashboardPage = () => {
  const { t } = useTranslation("items");
  const { t: tc } = useTranslation("common");
  const { data: categories = [] } = useCategories();
  const { data: locations = [] } = useStorageLocations();
  const { data: userSettings } = useUserSettings();
  const warningDays = userSettings?.expiry_warning_days;
  const consumeItem = useConsumeItem();
  const { toast } = useToast();
  const navigate = useNavigate();

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
  const [hideEmpty, setHideEmpty] = useState(() => {
    const saved = localStorage.getItem("dashboard.hideEmpty");
    return saved !== null ? saved === "true" : true;
  });
  const [quickConsumingId, setQuickConsumingId] = useState<string | null>(null);

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

  const expiredCount = baseFiltered.filter(
    (item) => getExpiryStatus(item.expiry_date, warningDays) === "expired",
  ).length;
  const expiringSoonCount = baseFiltered.filter(
    (item) => getExpiryStatus(item.expiry_date, warningDays) === "expiring-soon",
  ).length;
  const urgentCount = expiredCount + expiringSoonCount;

  const urgentItems = baseFiltered.filter((item) => {
    const status = getExpiryStatus(item.expiry_date, warningDays);
    return (status === "expired" || status === "expiring-soon") && item.units > 0;
  });
  const expiredItems = urgentItems.filter(
    (item) => getExpiryStatus(item.expiry_date, warningDays) === "expired",
  );
  const expiringSoonItems = urgentItems.filter(
    (item) => getExpiryStatus(item.expiry_date, warningDays) === "expiring-soon",
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length === items.length
              ? t("itemCountLabel", { count: items.length })
              : t("itemCountLabelFiltered", { filtered: filtered.length, total: items.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/items/new">
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" />
              {t("addItem")}
            </Button>
          </Link>
        </div>
      </div>

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
        </div>
      )}

      {/* Search */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button
          variant={showFilters ? "default" : "outline"}
          size="icon"
          onClick={() => setShowFilters((v) => !v)}
          aria-label={tc("filter")}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <Skeleton className="aspect-square w-full rounded-md" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
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
                onQuickConsume={(i) => {
                  void handleQuickConsume(i);
                }}
              />
            ))}
          </div>
          <div ref={sentinelRef} className="h-1" />
        </>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/")({
  validateSearch: dashboardSearchSchema,
  component: DashboardPage,
});
