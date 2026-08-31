import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { FloorPlanViewer } from "@/components/organisms/FloorPlanViewer";
import { StorageLocationMap } from "@/components/organisms/StorageLocationMap";
import { Button } from "@/components/ui/button";
import {
  useDeleteFloorPlanPlacement,
  useFloorPlan,
  useFloorPlanPlacements,
  useFloorPlanStorageLocationMarkers,
  useUpsertFloorPlanPlacement,
} from "@/hooks/useFloorPlans";
import { useItems } from "@/hooks/useItems";
import { useSignedLocationPhoto } from "@/hooks/useLocationPhoto";
import { useStorageLocations } from "@/hooks/useMasterData";

const ThreeDFloorPlanViewer = lazy(() =>
  import("@/components/organisms/ThreeDFloorPlanViewer").then((module) => ({
    default: module.ThreeDFloorPlanViewer,
  })),
);

export const LocationMapPage = () => {
  const { locationId } = Route.useParams();
  const isEditorActive = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === "/_auth/locations/$locationId/edit"),
  });
  const { t } = useTranslation("common");
  const { t: ts } = useTranslation("settings");
  const navigate = useNavigate();
  const [view, setView] = useState<"photo" | "2d" | "3d">("photo");
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);
  const {
    data: locations = [],
    isLoading: isLoadingLocations,
    isError: isLocationsError,
  } = useStorageLocations();
  const location = locations.find((l) => l.id === locationId);
  const {
    data: items = [],
    isLoading: isLoadingItems,
    isError: isItemsError,
  } = useItems({ storageLocationId: locationId }, "created_at");
  const { data: photoUrl } = useSignedLocationPhoto(location?.photo_path);
  // 写真マップは既存導線を最短で表示し、2D/3Dを選択した時だけ間取りを取得する。
  const { data: floorPlan, isLoading: isLoadingFloorPlan } = useFloorPlan(view !== "photo");
  const { data: storageLocationMarkers = [], isLoading: isLoadingStorageLocationMarkers } =
    useFloorPlanStorageLocationMarkers(floorPlan?.id ?? null);
  const { data: placements = [], isLoading: isLoadingPlacements } = useFloorPlanPlacements(
    floorPlan?.id ?? null,
  );
  const upsertPlacement = useUpsertFloorPlanPlacement();
  const deletePlacement = useDeleteFloorPlanPlacement();
  const placedItemIds = new Set(placements.map((placement) => placement.item_id));
  const unplacedFloorPlanItems = items.filter((item) => !placedItemIds.has(item.id));

  const pinnedItems = items
    .filter((item) => item.pin_x !== null && item.pin_x !== undefined && item.pin_y !== null)
    .map((item) => ({ id: item.id, name: item.name, x: item.pin_x!, y: item.pin_y! }));
  const unpinnedItems = items
    .filter((item) => item.pin_x === null || item.pin_x === undefined || item.pin_y === null)
    .map((item) => ({ id: item.id, name: item.name }));

  if (isEditorActive) {
    return <Outlet />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <ConfirmDialog
        open={removeTargetId !== null}
        title={t("confirmDeleteTitle")}
        message={t("mapRemovePlacementConfirm")}
        confirmLabel={t("delete")}
        isConfirming={deletePlacement.isPending}
        onConfirm={() => {
          if (!removeTargetId || !floorPlan) return;
          deletePlacement.mutate(
            { id: removeTargetId, floorPlanId: floorPlan.id },
            { onSuccess: () => setRemoveTargetId(null) },
          );
        }}
        onCancel={() => setRemoveTargetId(null)}
      />
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("back")}
          onClick={() => void navigate({ to: "/settings/locations" })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">{location?.name ?? ts("storageLocationMap")}</h1>
      </div>

      {isLoadingLocations ||
      isLoadingItems ||
      isLoadingFloorPlan ||
      isLoadingPlacements ||
      isLoadingStorageLocationMarkers ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : isLocationsError || isItemsError ? (
        <div className="space-y-3 rounded-lg border border-destructive p-4 text-center text-destructive">
          <p className="font-medium">{ts("storageLocationMapLoadError")}</p>
        </div>
      ) : (
        <>
          <div
            className="flex flex-wrap items-center gap-2"
            role="tablist"
            aria-label={t("mapTitle")}
          >
            {(["photo", "2d", "3d"] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={view === value ? "default" : "outline"}
                role="tab"
                aria-selected={view === value}
                onClick={() => setView(value)}
              >
                {value === "photo"
                  ? t("mapPhoto")
                  : value === "2d"
                    ? t("mapFloorPlan")
                    : t("map3d")}
              </Button>
            ))}
            {view === "2d" && (
              <Link to="/locations/$locationId/edit" params={{ locationId }}>
                <Button type="button" size="sm" variant="secondary">
                  {floorPlan ? t("mapEditSharedFloorPlan") : t("mapCreateSharedFloorPlan")}
                </Button>
              </Link>
            )}
          </div>
          {view === "photo" && (
            <StorageLocationMap
              photoUrl={photoUrl}
              pinnedItems={pinnedItems}
              unpinnedItems={unpinnedItems}
              onItemClick={(itemId) => void navigate({ to: "/items/$itemId", params: { itemId } })}
            />
          )}
          {view === "2d" &&
            (floorPlan ? (
              <FloorPlanViewer
                document={floorPlan.document}
                storageLocationMarkers={storageLocationMarkers}
                storageLocations={locations}
                highlightedStorageLocationId={locationId}
                onStorageLocationClick={(storageLocationId) =>
                  void navigate({
                    to: "/locations/$locationId",
                    params: { locationId: storageLocationId },
                  })
                }
                placements={placements}
                items={items}
                unplacedItems={unplacedFloorPlanItems}
                pendingItemId={pendingItemId}
                onSelectItemForPlacement={setPendingItemId}
                onCanvasClick={(point) => {
                  if (!pendingItemId || !floorPlan) return;
                  upsertPlacement.mutate(
                    { floorPlanId: floorPlan.id, itemId: pendingItemId, x: point.x, y: point.y },
                    { onSuccess: () => setPendingItemId(null) },
                  );
                }}
                onItemClick={(itemId) =>
                  void navigate({ to: "/items/$itemId", params: { itemId } })
                }
                onRemovePlacement={(placementId) => setRemoveTargetId(placementId)}
              />
            ) : (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                {t("mapNoSharedFloorPlan")}
              </p>
            ))}
          {view === "3d" &&
            (floorPlan ? (
              <Suspense
                fallback={
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                }
              >
                <ThreeDFloorPlanViewer
                  document={floorPlan.document}
                  storageLocationMarkers={storageLocationMarkers}
                  storageLocations={locations}
                  placements={placements}
                  items={items}
                  onItemClick={(itemId) =>
                    void navigate({ to: "/items/$itemId", params: { itemId } })
                  }
                />
              </Suspense>
            ) : (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">
                {t("mapNoSharedFloorPlan")}
              </p>
            ))}
        </>
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/locations/$locationId")({
  component: LocationMapPage,
});
