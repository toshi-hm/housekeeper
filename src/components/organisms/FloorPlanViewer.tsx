import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { snapToGrid } from "@/lib/floorPlanEditor";
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
  onRemovePlacement?: (placementId: string) => void;
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
  onRemovePlacement,
  pendingItemId = null,
  onSelectItemForPlacement,
  onCanvasClick,
}: FloorPlanViewerProps) => {
  const { t } = useTranslation("common");
  const itemsById = itemById(items);
  const storageLocationsById = new Map(storageLocations.map((location) => [location.id, location]));

  // Keyboard alternative to the pointer-only `onCanvasClick` placement flow
  // (#916): once an item is chosen from the list below, the canvas becomes a
  // focusable "application" that a keyboard user can move a cursor around on
  // (arrow keys, one grid step at a time) and confirm with Enter/Space —
  // mirroring the keyboard nudge already supported for walls/shapes in
  // FloorPlanEditor.tsx.
  const initialKeyboardCursor = (): { x: number; y: number } | null =>
    pendingItemId
      ? {
          x: snapToGrid(document.width / 2, document.gridSize, document.width),
          y: snapToGrid(document.height / 2, document.gridSize, document.height),
        }
      : null;
  const svgRef = useRef<SVGSVGElement>(null);
  const [keyboardCursor, setKeyboardCursor] = useState(initialKeyboardCursor);
  // Tracks which `pendingItemId` the current `keyboardCursor` was derived
  // for, so the cursor only resets to the grid center on an actual
  // selection change — not on every unrelated re-render, which would fight
  // a keyboard user actively nudging it with the arrow keys. Comparing and
  // resetting during render (rather than in a useEffect) is the pattern
  // React recommends for "adjusting state when a prop changes".
  const [cursorForPendingItemId, setCursorForPendingItemId] = useState(pendingItemId);
  const canKeyboardPlace = Boolean(onCanvasClick && pendingItemId);

  if (pendingItemId !== cursorForPendingItemId) {
    setCursorForPendingItemId(pendingItemId);
    setKeyboardCursor(initialKeyboardCursor());
  }

  // Move focus onto the canvas once an item is selected for placement, so a
  // keyboard user can immediately use the arrow keys without first tabbing
  // to find it.
  useEffect(() => {
    if (pendingItemId) svgRef.current?.focus();
  }, [pendingItemId]);

  const handleCanvasKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (!canKeyboardPlace || !keyboardCursor) return;
    if (
      event.key === "ArrowUp" ||
      event.key === "ArrowDown" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight"
    ) {
      event.preventDefault();
      const step = document.gridSize;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      setKeyboardCursor({
        x: snapToGrid(keyboardCursor.x + dx, step, document.width),
        y: snapToGrid(keyboardCursor.y + dy, step, document.height),
      });
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCanvasClick?.(keyboardCursor);
    }
  };

  return (
    <div className="space-y-3">
      <div className="overflow-auto rounded-lg border bg-muted/20 p-2">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${document.width} ${document.height}`}
          className="h-auto min-h-72 w-full min-w-[480px]"
          role={canKeyboardPlace ? "application" : "img"}
          tabIndex={canKeyboardPlace ? 0 : undefined}
          aria-label={
            canKeyboardPlace ? t("mapCanvasKeyboardPlacementAriaLabel") : t("mapFloorPlanAriaLabel")
          }
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
          onKeyDown={canKeyboardPlace ? handleCanvasKeyDown : undefined}
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
                    ? (event) => {
                        event.stopPropagation();
                        onStorageLocationClick(marker.storage_location_id);
                      }
                    : undefined
                }
                onKeyDown={
                  onStorageLocationClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
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
                onClick={
                  onItemClick
                    ? (event) => {
                        event.stopPropagation();
                        onItemClick(placement.item_id);
                      }
                    : undefined
                }
                onKeyDown={
                  onItemClick
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
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
          {canKeyboardPlace && keyboardCursor && (
            <circle
              data-testid="floor-plan-keyboard-cursor"
              cx={keyboardCursor.x}
              cy={keyboardCursor.y}
              r="12"
              fill="hsl(var(--accent) / 0.35)"
              stroke="hsl(var(--accent))"
              strokeDasharray="6 4"
              strokeWidth="3"
              pointerEvents="none"
            />
          )}
        </svg>
      </div>
      {canKeyboardPlace && (
        <p className="text-xs text-muted-foreground">{t("mapCanvasKeyboardPlacementHelp")}</p>
      )}
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
            const itemName = item?.name ?? t("mapUnknownItem");
            return (
              <li key={placement.id} className="flex items-center">
                <button
                  type="button"
                  className="flex-1 p-3 text-left text-sm hover:bg-muted/50"
                  onClick={onItemClick ? () => onItemClick(placement.item_id) : undefined}
                >
                  {itemName}
                </button>
                {onRemovePlacement && (
                  <button
                    type="button"
                    className="flex min-h-11 min-w-11 items-center justify-center text-muted-foreground hover:text-destructive"
                    aria-label={t("mapRemovePlacement", { name: itemName })}
                    onClick={() => onRemovePlacement(placement.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
