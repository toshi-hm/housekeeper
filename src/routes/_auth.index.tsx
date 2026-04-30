import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, Plus, Search, Settings, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ItemCard } from "@/components/molecules/ItemCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { type ItemFilters, type ItemSortKey,useItems } from "@/hooks/useItems";
import { useCategories, useStorageLocations } from "@/hooks/useMasterData";
import { getExpiryStatus } from "@/types/item";

const DashboardPage = () => {
  const { t } = useTranslation("items");
  const { data: categories = [] } = useCategories();
  const { data: locations = [] } = useStorageLocations();

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [expiryFilter, setExpiryFilter] = useState("");
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

  const filtered = items.filter((item) => {
    if (hideEmpty && item.units === 0) return false;
    if (expiryFilter && expiryFilter !== "all") {
      const status = getExpiryStatus(item.expiry_date);
      if (status !== expiryFilter) return false;
    }
    return true;
  });

  const urgentCount = items.filter((item) => {
    const status = getExpiryStatus(item.expiry_date);
    return (status === "expired" || status === "expiring-soon") && item.units > 0;
  }).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{items.length}件</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/settings">
            <Button variant="ghost" size="icon" aria-label="設定">
              <Settings className="h-5 w-5" />
            </Button>
          </Link>
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
        <div className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-yellow-800">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-sm">
            <span className="font-medium">{urgentCount}件</span>の在庫が期限切れまたは期限間近です
          </p>
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
          aria-label={t("common:filter")}
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="space-y-3 rounded-lg border p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("filterByCategory")}</label>
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">すべて</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("filterByLocation")}</label>
              <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">すべて</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">{t("filterByExpiry")}</label>
              <Select value={expiryFilter} onChange={(e) => setExpiryFilter(e.target.value)}>
                <option value="">すべて</option>
                <option value="expired">期限切れ</option>
                <option value="expiring-soon">期限間近</option>
                <option value="ok">期限内</option>
                <option value="unknown">期限不明</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">並び替え</label>
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
            使い切り在庫を隠す
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
          読み込みに失敗しました。再読み込みしてください。
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
          {items.length === 0 ? (
            <>
              <p className="text-lg font-medium">{t("noItems")}</p>
              <p className="mt-1 text-sm">最初の在庫を追加しましょう</p>
              <Link to="/items/new" className="mt-4">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("addItem")}
                </Button>
              </Link>
            </>
          ) : (
            <p className="text-lg font-medium">該当する在庫がありません</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {filtered.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              categoryName={item.category_id ? categoryMap[item.category_id] : undefined}
              locationName={item.storage_location_id ? locationMap[item.storage_location_id] : undefined}
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
