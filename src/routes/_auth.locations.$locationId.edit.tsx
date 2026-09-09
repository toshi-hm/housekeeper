import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { ConfirmDialog } from "@/components/molecules/ConfirmDialog";
import { FloorPlanEditor } from "@/components/organisms/FloorPlanEditor";
import { Button } from "@/components/ui/button";
import {
  useDeleteFloorPlanStorageLocationMarker,
  useFloorPlan,
  useFloorPlanStorageLocationMarkers,
  useUpsertFloorPlan,
  useUpsertFloorPlanStorageLocationMarker,
} from "@/hooks/useFloorPlans";
import { useStorageLocations } from "@/hooks/useMasterData";
import { FloorPlanConflictError, OfflineError } from "@/lib/requireOnline";
import { useToast } from "@/lib/toast-context";
import {
  createEmptyFloorPlanDocument,
  type FloorPlanStorageLocationMarker,
} from "@/types/floorPlan";

export const FloorPlanEditorPage = () => {
  const { locationId } = Route.useParams();
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedStorageLocationId, setSelectedStorageLocationId] = useState(locationId);
  const [markerToDelete, setMarkerToDelete] = useState<FloorPlanStorageLocationMarker | null>(null);
  const { data: locations = [], isLoading: locationsLoading } = useStorageLocations();
  const {
    data: floorPlan,
    isLoading: floorPlanLoading,
    isError,
    refetch: refetchFloorPlan,
  } = useFloorPlan();
  const { data: storageLocationMarkers = [], isLoading: markersLoading } =
    useFloorPlanStorageLocationMarkers(floorPlan?.id ?? null);
  const saveFloorPlan = useUpsertFloorPlan();
  const saveStorageLocationMarker = useUpsertFloorPlanStorageLocationMarker();
  const deleteStorageLocationMarker = useDeleteFloorPlanStorageLocationMarker();
  const location = locations.find((item) => item.id === locationId);

  if (locationsLoading || floorPlanLoading || markersLoading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  if (!location || isError) {
    return <p className="text-sm text-destructive">{t("unknownError")}</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <ConfirmDialog
        open={markerToDelete !== null}
        title={t("confirmDeleteTitle")}
        message={t("mapDeleteMarkerConfirm")}
        confirmLabel={t("delete")}
        isConfirming={deleteStorageLocationMarker.isPending}
        onConfirm={() => {
          if (!markerToDelete) return;
          deleteStorageLocationMarker.mutate(
            { id: markerToDelete.id, floorPlanId: markerToDelete.floor_plan_id },
            { onSuccess: () => setMarkerToDelete(null) },
          );
        }}
        onCancel={() => setMarkerToDelete(null)}
      />
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("goHome")}
          onClick={() => void navigate({ to: "/locations/$locationId", params: { locationId } })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <p className="text-sm text-muted-foreground">{location.name}</p>
          <h1 className="text-xl font-bold">{t("mapEditSharedFloorPlan")}</h1>
        </div>
      </div>
      <FloorPlanEditor
        key={`${floorPlan?.id ?? "new"}:${floorPlan?.revision ?? 0}`}
        initialDocument={floorPlan?.document ?? createEmptyFloorPlanDocument()}
        isSaving={saveFloorPlan.isPending}
        storageLocationMarkers={storageLocationMarkers}
        storageLocations={locations}
        selectedStorageLocationId={selectedStorageLocationId}
        onSelectStorageLocation={setSelectedStorageLocationId}
        onDeleteStorageLocationMarker={setMarkerToDelete}
        onStorageLocationMarkerChange={(point) => {
          if (!floorPlan) {
            toast(t("mapSaveBeforeMarker"), "error");
            return;
          }
          saveStorageLocationMarker.mutate({
            floorPlanId: floorPlan.id,
            storageLocationId: selectedStorageLocationId,
            x: point.x,
            y: point.y,
          });
        }}
        onSave={(document) => {
          saveFloorPlan.mutate(
            {
              id: floorPlan?.id,
              name: floorPlan?.name ?? t("mapSharedFloorPlanName"),
              document,
              revision: floorPlan?.revision,
            },
            {
              onSuccess: () => {
                toast(t("saveSuccess"), "success");
                void navigate({ to: "/locations/$locationId", params: { locationId } });
              },
              onError: (error) => {
                if (error instanceof FloorPlanConflictError) {
                  toast(t("mapFloorPlanConflict"), "error", {
                    action: {
                      label: t("mapReloadFloorPlan"),
                      onClick: () => {
                        void refetchFloorPlan();
                      },
                    },
                  });
                  return;
                }
                if (error instanceof OfflineError) {
                  toast(t("offlineError"), "error");
                  return;
                }
                toast(t("unknownError"), "error");
              },
            },
          );
        }}
      />
    </div>
  );
};

export const Route = createFileRoute("/_auth/locations/$locationId/edit")({
  component: FloorPlanEditorPage,
});
