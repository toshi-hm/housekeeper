import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Map as MapIcon, MapPin, Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { FloorPlanViewer } from "@/components/organisms/FloorPlanViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useFloorPlan,
  useFloorPlanPlacements,
  useFloorPlanStorageLocationMarkers,
} from "@/hooks/useFloorPlans";
import { useItems } from "@/hooks/useItems";
import { useStorageLocations } from "@/hooks/useMasterData";

export const MapPage = () => {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const {
    data: items = [],
    isLoading: itemsLoading,
    isError: itemsError,
  } = useItems({ search: search.trim() || undefined }, "created_at");
  // Unfiltered, for the shared floor plan's item-placement labels (below):
  // `items` narrows to the search query, but placements on the plan can
  // reference items that don't match the current search — using the
  // filtered list there made every non-matching placement render as
  // "Unknown item" as soon as the user typed anything.
  const { data: allItems = [] } = useItems({}, "created_at");
  const { data: locations = [], isLoading: locationsLoading } = useStorageLocations();
  const { data: floorPlan, isLoading: floorPlanLoading } = useFloorPlan();
  const { data: storageLocationMarkers = [], isLoading: markersLoading } =
    useFloorPlanStorageLocationMarkers(floorPlan?.id ?? null);
  const { data: placements = [], isLoading: placementsLoading } = useFloorPlanPlacements(
    floorPlan?.id ?? null,
  );
  const locationNames = useMemo(
    () => new Map(locations.map((location) => [location.id, location.name])),
    [locations],
  );
  const isLoading =
    itemsLoading || locationsLoading || floorPlanLoading || markersLoading || placementsLoading;

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
      {!locationsLoading && locations.length === 0 ? (
        // #916: without a storage location there is no `$locationId` to
        // reach `/locations/$locationId/edit` through, so there was
        // previously no way to even start a floor plan from this tab. Guide
        // the user to create one first instead of silently omitting the
        // floor-plan section.
        <div className="space-y-3 rounded-lg border border-dashed p-6 text-center">
          <MapPin className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <div>
            <p className="font-medium">{t("mapNoLocationsTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("mapNoLocationsHelp")}</p>
          </div>
          <Button onClick={() => void navigate({ to: "/settings/locations" })}>
            <Plus className="mr-1 h-4 w-4" />
            {t("mapCreateLocationCta")}
          </Button>
        </div>
      ) : locationsLoading || floorPlanLoading || markersLoading || placementsLoading ? (
        // #989: 共有間取りマップの取得中は Empty 状態（mapNoSharedFloorPlan）を出さず
        // ローディング表示にする。取得完了前に「未登録」を一瞬誤表示していた問題の修正。
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : floorPlan ? (
        <section className="space-y-2" aria-labelledby="shared-floor-plan">
          <div className="flex items-center justify-between gap-2">
            <h2 id="shared-floor-plan" className="text-base font-semibold">
              {t("mapSharedFloorPlan")}
            </h2>
            {locations[0] && (
              <Link to="/locations/$locationId/edit" params={{ locationId: locations[0].id }}>
                <span className="text-sm text-primary underline">
                  {t("mapEditSharedFloorPlan")}
                </span>
              </Link>
            )}
          </div>
          <FloorPlanViewer
            document={floorPlan.document}
            storageLocationMarkers={storageLocationMarkers}
            storageLocations={locations}
            placements={placements}
            items={allItems}
            onStorageLocationClick={(storageLocationId) => {
              void navigate({
                to: "/locations/$locationId",
                params: { locationId: storageLocationId },
              });
            }}
            onItemClick={(itemId) => {
              void navigate({ to: "/items/$itemId", params: { itemId } });
            }}
          />
        </section>
      ) : (
        <p className="rounded-lg border p-4 text-sm text-muted-foreground">
          {t("mapNoSharedFloorPlan")}
        </p>
      )}
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
