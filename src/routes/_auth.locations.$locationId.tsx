import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Spinner } from "@/components/atoms/Spinner";
import { StorageLocationMap } from "@/components/organisms/StorageLocationMap";
import { Button } from "@/components/ui/button";
import { useItems } from "@/hooks/useItems";
import { useSignedLocationPhoto } from "@/hooks/useLocationPhoto";
import { useStorageLocations } from "@/hooks/useMasterData";

const LocationMapPage = () => {
  const { locationId } = Route.useParams();
  const { t } = useTranslation("settings");
  const navigate = useNavigate();
  const { data: locations = [], isLoading: isLoadingLocations } = useStorageLocations();
  const location = locations.find((l) => l.id === locationId);
  const { data: items = [], isLoading: isLoadingItems } = useItems(
    { storageLocationId: locationId },
    "created_at",
  );
  const { data: photoUrl } = useSignedLocationPhoto(location?.photo_path);

  const pinnedItems = items
    .filter((item) => item.pin_x !== null && item.pin_x !== undefined && item.pin_y !== null)
    .map((item) => ({ id: item.id, name: item.name, x: item.pin_x!, y: item.pin_y! }));
  const unpinnedItems = items
    .filter((item) => item.pin_x === null || item.pin_x === undefined || item.pin_y === null)
    .map((item) => ({ id: item.id, name: item.name }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void navigate({ to: "/settings/locations" })}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">{location?.name ?? t("storageLocationMap")}</h1>
      </div>

      {isLoadingLocations || isLoadingItems ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <StorageLocationMap
          photoUrl={photoUrl}
          pinnedItems={pinnedItems}
          unpinnedItems={unpinnedItems}
          onItemClick={(itemId) => void navigate({ to: "/items/$itemId", params: { itemId } })}
        />
      )}
    </div>
  );
};

export const Route = createFileRoute("/_auth/locations/$locationId")({
  component: LocationMapPage,
});
