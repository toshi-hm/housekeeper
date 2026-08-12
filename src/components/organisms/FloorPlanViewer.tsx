import { useTranslation } from "react-i18next";

import type {
  FloorPlanDocument,
  FloorPlanItemPlacement,
  FloorPlanStorageLocationMarker,
} from "@/types/floorPlan";
import type { Item, StorageLocation } from "@/types/item";

interface FloorPlanViewerProps {
  document: FloorPlanDocument;
  storageLocationMarkers?: FloorPlanStorageLocationMarker[];
  storageLocations?: StorageLocation[];
  highlightedStorageLocationId?: string | null;
  onStorageLocationClick?: (storageLocationId: string) => void;
  placements?: FloorPlanItemPlacement[];
  items?: Item[];
  unplacedItems?: Item[];
  highlightedItemId?: string | null;
  onItemClick?: (itemId: string) => void;
  pendingItemId?: string | null;
  onSelectItemForPlacement?: (itemId: string) => void;
  onCanvasClick?: (point: { x: number; y: number }) => void;
}

const itemById = (items: Item[]): Map<string, Item> =>
  new Map(items.map((item) => [item.id, item]));

export const FloorPlanViewer = ({
  document,
  storageLocationMarkers = [],
  storageLocations = [],
  highlightedStorageLocationId = null,
  onStorageLocationClick,
  placements = [],
  items = [],
  unplacedItems = [],
  highlightedItemId = null,
  onItemClick,
  pendingItemId = null,
  onSelectItemForPlacement,
  onCanvasClick,
}: FloorPlanViewerProps) => {
  const { t } = useTranslation("common");
  const itemsById = itemById(items);
  const storageLocationsById = new Map(storageLocations.map((location) => [location.id, location]));

  return (
    <div className="space-y-3">
      <div className="overflow-auto rounded-lg border bg-muted/20 p-2">
        <svg
          viewBox={`0 0 ${document.width} ${document.height}`}
          className="h-auto min-h-72 w-full min-w-[480px]"
          role="img"
          aria-label={t("mapFloorPlanAriaLabel")}
          onClick={
            onCanvasClick
              ? (event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  onCanvasClick({
                    x: ((event.clientX - rect.left) / rect.width) * document.width,
                    y: ((event.clientY - rect.top) / rect.height) * document.height,
                  });
                }
              : undefined
          }
        >
          <defs>
            <pattern
              id="floor-plan-grid"
              width={document.gridSize}
              height={document.gridSize}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${document.gridSize} 0 L 0 0 0 ${document.gridSize}`}
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.12"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect width={document.width} height={document.height} fill="url(#floor-plan-grid)" />
          {document.walls.map((wall) => (
            <line
              key={wall.id}
              x1={wall.start.x}
              y1={wall.start.y}
              x2={wall.end.x}
              y2={wall.end.y}
              stroke="currentColor"
              strokeWidth={wall.thickness}
              strokeLinecap="round"
            />
          ))}
          {document.shapes.map((shape) => {
            const transform = `rotate(${shape.rotation} ${shape.x + shape.width / 2} ${shape.y + shape.height / 2})`;
            if (shape.kind === "circle") {
              return (
                <ellipse
                  key={shape.id}
                  cx={shape.x + shape.width / 2}
                  cy={shape.y + shape.height / 2}
                  rx={shape.width / 2}
                  ry={shape.height / 2}
                  transform={transform}
                  fill="hsl(var(--primary) / 0.12)"
                  stroke="hsl(var(--primary))"
                  strokeWidth="2"
                />
              );
            }
            return (
              <g key={shape.id} transform={transform}>
                <rect
                  x={shape.x}
                  y={shape.y}
                  width={shape.width}
                  height={shape.height}
                  rx="4"
                  fill={shape.kind === "label" ? "transparent" : "hsl(var(--primary) / 0.12)"}
                  stroke="hsl(var(--primary))"
                  strokeWidth="2"
                  strokeDasharray={shape.kind === "label" ? "4 4" : undefined}
                />
                {shape.label && (
                  <text x={shape.x + 4} y={shape.y + 16} fontSize="12" fill="currentColor">
                    {shape.label}
                  </text>
                )}
              </g>
            );
          })}
          {storageLocationMarkers.map((marker) => {
            const location = storageLocationsById.get(marker.storage_location_id);
            const isHighlighted = marker.storage_location_id === highlightedStorageLocationId;
            return (
              <g
                key={marker.id}
                role={onStorageLocationClick ? "button" : undefined}
                tabIndex={onStorageLocationClick ? 0 : undefined}
                aria-label={location?.name ?? t("mapUnknownStorageLocation")}
                className={onStorageLocationClick ? "cursor-pointer" : undefined}
                onClick={
                  onStorageLocationClick
                    ? () => onStorageLocationClick(marker.storage_location_id)
                    : undefined
                }
                onKeyDown={
                  onStorageLocationClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onStorageLocationClick(marker.storage_location_id);
                        }
                      }
                    : undefined
                }
              >
                <circle
                  cx={marker.x}
                  cy={marker.y}
                  r={isHighlighted ? 14 : 11}
                  fill={isHighlighted ? "hsl(var(--destructive))" : "hsl(var(--accent))"}
                  stroke="hsl(var(--background))"
                  strokeWidth="3"
                />
                <text x={marker.x + 16} y={marker.y + 4} fontSize="12" fill="currentColor">
                  {location?.name ?? t("mapUnknownStorageLocation")}
                </text>
              </g>
            );
          })}
          {placements.map((placement) => {
            const item = itemsById.get(placement.item_id);
            const isHighlighted = placement.item_id === highlightedItemId;
            return (
              <g
                key={placement.id}
                role={onItemClick ? "button" : undefined}
                tabIndex={onItemClick ? 0 : undefined}
                aria-label={item?.name ?? t("mapUnknownItem")}
                className={onItemClick ? "cursor-pointer" : undefined}
                onClick={onItemClick ? () => onItemClick(placement.item_id) : undefined}
                onKeyDown={
                  onItemClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onItemClick(placement.item_id);
                        }
                      }
                    : undefined
                }
              >
                <circle
                  cx={placement.x}
                  cy={placement.y}
                  r={isHighlighted ? 12 : 9}
                  fill={isHighlighted ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                  stroke="hsl(var(--background))"
                  strokeWidth="3"
                />
                <text x={placement.x + 14} y={placement.y + 4} fontSize="12" fill="currentColor">
                  {item?.name ?? t("mapUnknownItem")}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-xs text-muted-foreground">{t("mapFloorPlanFallbackHelp")}</p>
      {storageLocationMarkers.length > 0 && (
        <ul className="divide-y rounded-lg border" aria-label={t("mapStorageLocations")}>
          {storageLocationMarkers.map((marker) => {
            const location = storageLocationsById.get(marker.storage_location_id);
            return (
              <li key={marker.id}>
                <button
                  type="button"
                  className="w-full p-3 text-left text-sm hover:bg-muted/50"
                  onClick={
                    onStorageLocationClick
                      ? () => onStorageLocationClick(marker.storage_location_id)
                      : undefined
                  }
                >
                  {location?.name ?? t("mapUnknownStorageLocation")}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {onSelectItemForPlacement && unplacedItems.length > 0 && (
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-sm font-medium">{t("mapChooseItemToPlace")}</p>
          <p className="text-xs text-muted-foreground">{t("mapChooseItemToPlaceHelp")}</p>
          <div className="flex flex-wrap gap-2">
            {unplacedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`min-h-11 rounded-md border px-3 py-2 text-sm ${pendingItemId === item.id ? "border-primary bg-primary/10" : "hover:bg-muted/50"}`}
                aria-pressed={pendingItemId === item.id}
                onClick={() => onSelectItemForPlacement(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
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
    </div>
  );
};
