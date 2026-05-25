import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ItemCard } from "@/components/molecules/ItemCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { type ItemFilters, type ItemSortKey, useItems } from "@/hooks/useItems";
import { useCategories, useStorageLocations } from "@/hooks/useMasterData";
import { useUserSettings } from "@/hooks/useUserSettings";
import { getExpiryStatus } from "@/types/item";

type QuickFilterKey = "all" | "urgent" | "expired" | "expiring-soon" | "ok";

const QUICK_FILTER_OPTIONS: ReadonlyArray<{
  key: QuickFilterKey;
  labelKey: string;
}> = [
  { key: "all", labelKey: "quickFilterAll" },
  { key: "urgent", labelKey: "quickFilterUrgent" },
  { key: "expired", labelKey: "expiryStatus.expired" },
  { key: "expiring-soon", labelKey: "expiryStatus.expiring-soon" },
  { key: "ok", labelKey: "expiryStatus.ok" },
];

const DashboardPage = () => {
  const { t } = useTranslation("items");
  const { t: tc } = useTranslation("common");
  const { data: categories = [] } = useCategories();
  const { data: locations = [] } = useStorageLocations();
  const { data: userSettings } = useUserSettings();
  const warningDays = userSettings?.expiry_warning_days;

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [expiryFilter, setExpiryFilter] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilterKey>("all");
  const [sort, setSort] = useState<ItemSortKey>("created_at");
  const [showFilters, setShowFilters] = useState(false);
  const [hideEmpty, setHideEmpty] = useState(true);

  const filters: ItemFilters = {
    search: search || undefined,
    categoryId: categoryId || undefined,
    storageLocationId: locationId || undefined,
  };

  const { data: items = [], isLoading, error } = useItems(filters, sort);

  const categoryMap = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const locationMap = Object.fromEntries(locations.map((l) => [l.id, l.name]));

  const {
    visibleItemsWithStatus,
    filtered,
    urgentItems,
    expiredItems,
    expiringSoonItems,
    quickFilterCounts,
  } = useMemo(() => {
    const itemsWithStatus = items.map((item) => ({
      item,
      status: getExpiryStatus(item.expiry_date, warningDays),
    }));

    const visibleItemsWithStatus = itemsWithStatus.filter(
      ({ item }) => !hideEmpty || item.units > 0,
    );

    const filtered = visibleItemsWithStatus
      .filter(({ status }) => {
        if (quickFilter === "urgent") return status === "expired" || status === "expiring-soon";
        if (quickFilter === "all") return true;
        return status === quickFilter;
      })
      .filter(({ status }) => !expiryFilter || expiryFilter === "all" || status === expiryFilter)
      .map(({ item }) => item);

    const urgentItems = visibleItemsWithStatus
      .filter(({ status }) => status === "expired" || status === "expiring-soon")
      .map(({ item }) => item);
    const expiredItems = visibleItemsWithStatus
      .filter(({ status }) => status === "expired")
      .map(({ item }) => item);
    const expiringSoonItems = visibleItemsWithStatus
      .filter(({ status }) => status === "expiring-soon")
      .map(({ item }) => item);

    const quickFilterCounts = {
      all: visibleItemsWithStatus.length,
      urgent: urgentItems.length,
      expired: expiredItems.length,
      "expiring-soon": expiringSoonItems.length,
      ok: visibleItemsWithStatus.filter(({ status }) => status === "ok").length,
    } as const;

    return {
      visibleItemsWithStatus,
      filtered,
      urgentItems,
      expiredItems,
      expiringSoonItems,
      quickFilterCounts,
    };
  }, [expiryFilter, hideEmpty, items, quickFilter, warningDays]);

  const urgentCount = urgentItems.length;

  const hasActiveFilters = Boolean(
    search || categoryId || locationId || expiryFilter || quickFilter !== "all" || !hideEmpty,
  );

  const clearFilters = () => {
    setSearch("");
    setCategoryId("");
    setLocationId("");
    setExpiryFilter("");
    setQuickFilter("all");
    setHideEmpty(true);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("countLabel", { count: filtered.length, total: visibleItemsWithStatus.length })}
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
              {t("urgentBannerDetails")} ({urgentCount})
            </summary>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-yellow-400 text-yellow-900"
                onClick={() => setQuickFilter("expired")}
              >
                {t("showExpiredOnly")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-yellow-400 text-yellow-900"
                onClick={() => setQuickFilter("expiring-soon")}
              >
                {t("showExpiringSoonOnly")}
              </Button>
            </div>
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

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("quickFiltersLabel")}</p>
        <div className="flex flex-wrap gap-2">
          {QUICK_FILTER_OPTIONS.map((chip) => (
            <Button
              key={chip.key}
              variant={quickFilter === chip.key ? "default" : "outline"}
              aria-pressed={quickFilter === chip.key}
              size="sm"
              className="h-8 rounded-full px-3 text-xs"
              onClick={() => setQuickFilter(chip.key)}
            >
              {t(chip.labelKey)} ({quickFilterCounts[chip.key]})
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{t("sortShortcutsLabel")}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={sort === "expiry_date" ? "default" : "outline"}
            size="sm"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => setSort("expiry_date")}
          >
            {t("sortByExpiry")}
          </Button>
          <Button
            variant={sort === "purchase_date" ? "default" : "outline"}
            size="sm"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => setSort("purchase_date")}
          >
            {t("sortByPurchaseDate")}
          </Button>
          <Button
            variant={sort === "created_at" ? "default" : "outline"}
            size="sm"
            className="h-8 rounded-full px-3 text-xs"
            onClick={() => setSort("created_at")}
          >
            {t("sortByCreatedAt")}
          </Button>
        </div>
      </div>

      {hasActiveFilters && (
        <div className="flex items-center justify-between rounded-lg border border-dashed p-2 text-xs">
          <span className="text-muted-foreground">
            {t("activeFilterResult", { count: filtered.length })}
          </span>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={clearFilters}>
            <X className="mr-1 h-3.5 w-3.5" />
            {t("clearFilters")}
          </Button>
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
              <Select value={sort} onChange={(e) => setSort(e.target.value as ItemSortKey)}>
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
              onChange={(e) => setHideEmpty(e.target.checked)}
              className="rounded"
            />
            {t("hideEmpty")}
          </label>
        </div>
      )}

      {/* Loading / Error / Content */}
      {isLoading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <Spinner />
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
            <>
              <p className="text-lg font-medium">{t("noMatchingItems")}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={clearFilters}>
                {t("clearFilters")}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              categoryName={item.category_id ? categoryMap[item.category_id] : undefined}
              locationName={
                item.storage_location_id ? locationMap[item.storage_location_id] : undefined
              }
              warningDays={warningDays}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/")({
  component: DashboardPage,
});
