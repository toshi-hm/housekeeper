import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { FloorPlanEditor } from "@/components/organisms/FloorPlanEditor";
import { Button } from "@/components/ui/button";
import { useFloorPlan, useUpsertFloorPlan } from "@/hooks/useFloorPlans";
import { useStorageLocations } from "@/hooks/useMasterData";
import { FloorPlanConflictError } from "@/lib/requireOnline";
import { useToast } from "@/lib/toast-context";
import { createEmptyFloorPlanDocument } from "@/types/floorPlan";

const FloorPlanEditorPage = () => {
  const { locationId } = Route.useParams();
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: locations = [], isLoading: locationsLoading } = useStorageLocations();
  const {
    data: floorPlan,
    isLoading: floorPlanLoading,
    isError,
    refetch: refetchFloorPlan,
  } = useFloorPlan(locationId);
  const saveFloorPlan = useUpsertFloorPlan();
  const location = locations.find((item) => item.id === locationId);

  if (locationsLoading || floorPlanLoading) {
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
          <h1 className="text-xl font-bold">{t("mapEditFloorPlan")}</h1>
        </div>
      </div>
      <FloorPlanEditor
        key={`${floorPlan?.id ?? "new"}:${floorPlan?.revision ?? 0}`}
        initialDocument={floorPlan?.document ?? createEmptyFloorPlanDocument()}
        isSaving={saveFloorPlan.isPending}
        onSave={(document) => {
          saveFloorPlan.mutate(
            {
              id: floorPlan?.id,
              storageLocationId: locationId,
              name: floorPlan?.name ?? `${location.name} ${t("mapFloorPlan")}`,
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
