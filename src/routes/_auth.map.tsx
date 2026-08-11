import { createFileRoute, Link } from "@tanstack/react-router";
import { Map as MapIcon, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { Input } from "@/components/ui/input";
import { useItems } from "@/hooks/useItems";
import { useStorageLocations } from "@/hooks/useMasterData";

const MapPage = () => {
  const { t } = useTranslation("common");
  const [search, setSearch] = useState("");
  const {
    data: items = [],
    isLoading: itemsLoading,
    isError: itemsError,
  } = useItems({ search: search.trim() || undefined }, "created_at");
  const { data: locations = [], isLoading: locationsLoading } = useStorageLocations();
  const locationNames = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations],
  );
  const isLoading = itemsLoading || locationsLoading;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MapIcon className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">{t("mapTitle")}</h1>
      </div>
      <label className="relative block">
        <span className="sr-only">{t("mapSearchResults")}</span>
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("mapSearchPlaceholder")}
          className="pl-9"
        />
      </label>
      <section aria-labelledby="map-search-results" className="space-y-2">
        <h2 id="map-search-results" className="text-base font-semibold">
          {t("mapSearchResults")}
        </h2>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : itemsError ? (
          <p className="rounded-lg border border-destructive p-4 text-sm text-destructive">
            {t("unknownError")}
          </p>
        ) : items.length === 0 ? (
          <p className="rounded-lg border p-4 text-sm text-muted-foreground">{t("mapNoResults")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {items.map((item) => (
              <li key={item.id}>
                {item.storage_location_id ? (
                  <Link
                    to="/locations/$locationId"
                    params={{ locationId: item.storage_location_id }}
                    className="block p-3 hover:bg-muted/50"
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {locationNames.get(item.storage_location_id) ?? t("mapUnknownItem")}
                    </span>
                  </Link>
                ) : (
                  <div className="p-3">
                    <span className="font-medium">{item.name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">—</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export const Route = createFileRoute("/_auth/map")({
  component: MapPage,
});
