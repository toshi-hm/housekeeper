import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useTranslation } from "react-i18next";

import type {
  FloorPlanDocument,
  FloorPlanItemPlacement,
  FloorPlanStorageLocationMarker,
} from "@/types/floorPlan";
import type { Item, StorageLocation } from "@/types/item";

interface ThreeDFloorPlanViewerProps {
  document: FloorPlanDocument;
  storageLocationMarkers?: FloorPlanStorageLocationMarker[];
  storageLocations?: StorageLocation[];
  placements?: FloorPlanItemPlacement[];
  items?: Item[];
  highlightedItemId?: string | null;
  onItemClick?: (itemId: string) => void;
}

const itemById = (items: Item[]): Map<string, Item> =>
  new Map(items.map((item) => [item.id, item]));

const FloorPlanScene = ({
  document,
  storageLocationMarkers = [],
  placements = [],
  highlightedItemId = null,
  onItemClick,
}: ThreeDFloorPlanViewerProps) => (
  <>
    <ambientLight intensity={1.5} />
    <directionalLight position={[200, 400, 200]} intensity={2} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[document.width / 2, 0, document.height / 2]}>
      <planeGeometry args={[document.width, document.height]} />
      <meshStandardMaterial color="#e5e7eb" />
    </mesh>
    {document.walls.map((wall) => {
      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      return (
        <mesh
          key={wall.id}
          position={[(wall.start.x + wall.end.x) / 2, 12, (wall.start.y + wall.end.y) / 2]}
          rotation={[0, -angle, 0]}
        >
          <boxGeometry args={[length, 24, wall.thickness]} />
          <meshStandardMaterial color="#374151" />
        </mesh>
      );
    })}
    {document.shapes.map((shape) => (
      <mesh
        key={shape.id}
        position={[shape.x + shape.width / 2, 18, shape.y + shape.height / 2]}
        rotation={[0, (-shape.rotation * Math.PI) / 180, 0]}
      >
        {shape.kind === "circle" ? (
          <cylinderGeometry args={[shape.width / 2, shape.width / 2, 36, 32]} />
        ) : (
          <boxGeometry args={[shape.width, 36, shape.height]} />
        )}
        <meshStandardMaterial color={shape.kind === "label" ? "#93c5fd" : "#60a5fa"} />
      </mesh>
    ))}
    {storageLocationMarkers.map((marker) => (
      <mesh key={marker.id} position={[marker.x, 48, marker.y]}>
        <sphereGeometry args={[18, 24, 16]} />
        <meshStandardMaterial color="#f97316" />
      </mesh>
    ))}
    {placements.map((placement) => {
      const isHighlighted = placement.item_id === highlightedItemId;
      return (
        <mesh
          key={placement.id}
          position={[placement.x, 16, placement.y]}
          onClick={
            onItemClick
              ? (event) => {
                  event.stopPropagation();
                  onItemClick(placement.item_id);
                }
              : undefined
          }
        >
          <coneGeometry args={[14, 32, 16]} />
          <meshStandardMaterial color={isHighlighted ? "#dc2626" : "#2563eb"} />
        </mesh>
      );
    })}
    <OrbitControls target={[document.width / 2, 0, document.height / 2]} />
  </>
);

export const ThreeDFloorPlanViewer = ({
  document,
  storageLocationMarkers = [],
  storageLocations = [],
  placements = [],
  items = [],
  highlightedItemId = null,
  onItemClick,
}: ThreeDFloorPlanViewerProps) => {
  const { t } = useTranslation("common");
  const itemsById = itemById(items);
  return (
    <div className="space-y-2">
      <div className="h-[min(70vh,32rem)] min-h-72 overflow-hidden rounded-lg border bg-slate-100">
        <Canvas
          camera={{ position: [document.width / 2, document.height, document.height], fov: 45 }}
          fallback={<p className="p-4 text-sm text-muted-foreground">{t("map3dFallback")}</p>}
        >
          <FloorPlanScene
            document={document}
            storageLocationMarkers={storageLocationMarkers}
            placements={placements}
            highlightedItemId={highlightedItemId}
            onItemClick={onItemClick}
          />
        </Canvas>
      </div>
      {storageLocationMarkers.length > 0 && (
        <ul className="divide-y rounded-lg border" aria-label={t("mapStorageLocations")}>
          {storageLocationMarkers.map((marker) => (
            <li key={marker.id} className="p-3 text-sm">
              {storageLocations.find((location) => location.id === marker.storage_location_id)
                ?.name ?? t("mapUnknownStorageLocation")}
            </li>
          ))}
        </ul>
      )}
      {placements.length > 0 && (
        <ul className="divide-y rounded-lg border" aria-label={t("mapPlacedItems")}>
          {placements.map((placement) => {
            const item = itemsById.get(placement.item_id);
            return (
              <li key={placement.id}>
                <button
                  type="button"
                  className="w-full p-3 text-left text-sm hover:bg-muted/50"
                  onClick={onItemClick ? () => onItemClick(placement.item_id) : undefined}
                >
                  {item?.name ?? t("mapUnknownItem")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{t("map3dHelp")}</p>
    </div>
  );
};
