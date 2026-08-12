import { useReducer, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  createFloorPlanEditorState,
  floorPlanEditorReducer,
  type FloorPlanTool,
  normalizeRect,
  snapToGrid,
} from "@/lib/floorPlanEditor";
import type { FloorPlanDocument, FloorPlanStorageLocationMarker } from "@/types/floorPlan";
import type { StorageLocation } from "@/types/item";

interface FloorPlanEditorProps {
  initialDocument: FloorPlanDocument;
  onSave: (document: FloorPlanDocument) => void;
  isSaving?: boolean;
  storageLocationMarkers?: FloorPlanStorageLocationMarker[];
  storageLocations?: StorageLocation[];
  selectedStorageLocationId?: string;
  onSelectStorageLocation?: (storageLocationId: string) => void;
  onStorageLocationMarkerChange?: (point: Point) => void;
}

interface Point {
  x: number;
  y: number;
}

const newId = (): string => crypto.randomUUID();

export const FloorPlanEditor = ({
  initialDocument,
  onSave,
  isSaving = false,
  storageLocationMarkers = [],
  storageLocations = [],
  selectedStorageLocationId,
  onSelectStorageLocation,
  onStorageLocationMarkerChange,
}: FloorPlanEditorProps) => {
  const { t } = useTranslation("common");
  const toolLabel = {
    select: t("mapToolSelect"),
    wall: t("mapToolWall"),
    rectangle: t("mapToolRectangle"),
    circle: t("mapToolCircle"),
    label: t("mapToolLabel"),
  } as const satisfies Record<FloorPlanTool, string>;
  const [state, dispatch] = useReducer(
    floorPlanEditorReducer,
    initialDocument,
    createFloorPlanEditorState,
  );
  const [tool, setTool] = useState<FloorPlanTool>("select");
  const [start, setStart] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [isMarkerMode, setIsMarkerMode] = useState(false);

  const getPoint = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = state.document.width / rect.width;
    const scaleY = state.document.height / rect.height;
    return {
      x: snapToGrid((event.clientX - rect.left) * scaleX, state.document.gridSize),
      y: snapToGrid((event.clientY - rect.top) * scaleY, state.document.gridSize),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (isMarkerMode) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setCurrentPoint(getPoint(event));
      return;
    }
    if (tool === "select") return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getPoint(event);
    setStart(point);
    setCurrentPoint(point);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (isMarkerMode || start) setCurrentPoint(getPoint(event));
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (isMarkerMode) {
      onStorageLocationMarkerChange?.(getPoint(event));
      setIsMarkerMode(false);
      setCurrentPoint(null);
      return;
    }
    if (!start || tool === "select") return;
    const end = getPoint(event);
    if (tool === "wall") {
      dispatch({
        type: "add-wall",
        wall: { id: newId(), start, end, thickness: 8 },
      });
    } else {
      const rect = normalizeRect(start, end, state.document.gridSize);
      dispatch({
        type: "add-shape",
        shape: {
          ...rect,
          id: newId(),
          kind: tool,
          rotation: 0,
          label: tool === "label" ? t("mapNewShape") : null,
        },
      });
    }
    setStart(null);
    setCurrentPoint(null);
  };

  const handlePointerCancel = () => {
    setStart(null);
    setCurrentPoint(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      dispatch({ type: event.shiftKey ? "redo" : "undo" });
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      dispatch({ type: "redo" });
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      dispatch({ type: "delete-selected" });
    } else if (event.key === "Escape") {
      setTool("select");
      setIsMarkerMode(false);
      setStart(null);
      setCurrentPoint(null);
      dispatch({ type: "select", id: null, kind: null });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="toolbar" aria-label={t("mapEditorToolbar")}>
        {(["select", "wall", "rectangle", "circle", "label"] as const).map((value) => (
          <Button
            key={value}
            type="button"
            variant={tool === value ? "default" : "outline"}
            size="sm"
            onClick={() => setTool(value)}
          >
            {toolLabel[value]}
          </Button>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={state.undoStack.length === 0}
          onClick={() => dispatch({ type: "undo" })}
        >
          {t("undo")}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={state.redoStack.length === 0}
          onClick={() => dispatch({ type: "redo" })}
        >
          {t("mapRedo")}
        </Button>
        <Button type="button" size="sm" disabled={isSaving} onClick={() => onSave(state.document)}>
          {isSaving ? t("mapSaving") : t("save")}
        </Button>
      </div>
      {storageLocations.length > 0 && onSelectStorageLocation && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">{t("mapStorageLocationMarkerTarget")}</span>
            <select
              className="min-h-11 rounded-md border bg-background px-3 py-2"
              value={selectedStorageLocationId ?? ""}
              onChange={(event) => onSelectStorageLocation(event.target.value)}
              aria-label={t("mapStorageLocationMarkerTarget")}
            >
              {storageLocations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            size="sm"
            variant={isMarkerMode ? "default" : "outline"}
            disabled={!selectedStorageLocationId}
            onClick={() => setIsMarkerMode((current) => !current)}
          >
            {isMarkerMode ? t("mapPlaceMarkerActive") : t("mapPlaceMarker")}
          </Button>
          <p className="basis-full text-xs text-muted-foreground">{t("mapPlaceMarkerHelp")}</p>
        </div>
      )}
      <div className="overflow-auto rounded-lg border bg-muted/20 p-2">
        <svg
          viewBox={`0 0 ${state.document.width} ${state.document.height}`}
          // Only opt out of native touch scrolling while a gesture on the
          // canvas actually means something (drawing a wall/shape or placing
          // a marker). In "select" mode, `touch-none` unconditionally here
          // blocked the only way to pan this min-w-[480px] canvas into view
          // on phones narrower than that (#819 review).
          className={`h-auto min-h-80 w-full min-w-[480px] ${
            tool === "select" && !isMarkerMode ? "touch-auto" : "touch-none"
          }`}
          role="application"
          tabIndex={0}
          aria-label={t("mapEditorAriaLabel")}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onLostPointerCapture={handlePointerCancel}
          onKeyDown={handleKeyDown}
        >
          <defs>
            <pattern
              id="floor-plan-editor-grid"
              width={state.document.gridSize}
              height={state.document.gridSize}
              patternUnits="userSpaceOnUse"
            >
              <path
                d={`M ${state.document.gridSize} 0 L 0 0 0 ${state.document.gridSize}`}
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.16"
                strokeWidth="0.5"
              />
            </pattern>
          </defs>
          <rect
            width={state.document.width}
            height={state.document.height}
            fill="url(#floor-plan-editor-grid)"
          />
          {state.document.walls.map((wall) => (
            <line
              key={wall.id}
              x1={wall.start.x}
              y1={wall.start.y}
              x2={wall.end.x}
              y2={wall.end.y}
              stroke={state.selectedId === wall.id ? "hsl(var(--destructive))" : "currentColor"}
              strokeWidth={wall.thickness}
              strokeLinecap="round"
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: "select", id: wall.id, kind: "wall" });
              }}
            />
          ))}
          {state.document.shapes.map((shape) => (
            <g
              key={shape.id}
              transform={`rotate(${shape.rotation} ${shape.x + shape.width / 2} ${shape.y + shape.height / 2})`}
              onClick={(event) => {
                event.stopPropagation();
                dispatch({ type: "select", id: shape.id, kind: "shape" });
              }}
            >
              <rect
                x={shape.x}
                y={shape.y}
                width={shape.width}
                height={shape.height}
                rx="4"
                fill={
                  state.selectedId === shape.id
                    ? "hsl(var(--destructive) / 0.16)"
                    : "hsl(var(--primary) / 0.12)"
                }
                stroke={
                  state.selectedId === shape.id ? "hsl(var(--destructive))" : "hsl(var(--primary))"
                }
                strokeWidth="2"
              />
              {shape.label && (
                <text x={shape.x + 4} y={shape.y + 16} fontSize="12" fill="currentColor">
                  {shape.label}
                </text>
              )}
            </g>
          ))}
          {start && currentPoint && tool !== "select" && (
            <g data-testid="floor-plan-drawing-preview" pointerEvents="none">
              {tool === "wall" ? (
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={currentPoint.x}
                  y2={currentPoint.y}
                  stroke="hsl(var(--primary))"
                  strokeWidth="8"
                  strokeDasharray="10 6"
                  strokeOpacity="0.75"
                  strokeLinecap="round"
                />
              ) : (
                (() => {
                  const preview = normalizeRect(start, currentPoint, state.document.gridSize);
                  if (tool === "circle") {
                    return (
                      <ellipse
                        cx={preview.x + preview.width / 2}
                        cy={preview.y + preview.height / 2}
                        rx={preview.width / 2}
                        ry={preview.height / 2}
                        fill="hsl(var(--primary) / 0.12)"
                        stroke="hsl(var(--primary))"
                        strokeDasharray="10 6"
                        strokeOpacity="0.75"
                        strokeWidth="2"
                      />
                    );
                  }
                  return (
                    <rect
                      x={preview.x}
                      y={preview.y}
                      width={preview.width}
                      height={preview.height}
                      rx="4"
                      fill={tool === "label" ? "transparent" : "hsl(var(--primary) / 0.12)"}
                      stroke="hsl(var(--primary))"
                      strokeDasharray="10 6"
                      strokeOpacity="0.75"
                      strokeWidth="2"
                    />
                  );
                })()
              )}
            </g>
          )}
          {isMarkerMode && currentPoint && (
            <circle
              data-testid="floor-plan-marker-preview"
              cx={currentPoint.x}
              cy={currentPoint.y}
              r="12"
              fill="hsl(var(--accent))"
              fillOpacity="0.65"
              stroke="hsl(var(--background))"
              strokeDasharray="6 4"
              strokeWidth="3"
              pointerEvents="none"
            />
          )}
          {storageLocationMarkers.map((marker) => {
            const location = storageLocations.find(
              (candidate) => candidate.id === marker.storage_location_id,
            );
            const isSelected = marker.storage_location_id === selectedStorageLocationId;
            return (
              <g key={marker.id} pointerEvents="none">
                <circle
                  cx={marker.x}
                  cy={marker.y}
                  r={isSelected ? 14 : 11}
                  fill={isSelected ? "hsl(var(--destructive))" : "hsl(var(--accent))"}
                  stroke="hsl(var(--background))"
                  strokeWidth="3"
                />
                <text x={marker.x + 16} y={marker.y + 4} fontSize="12" fill="currentColor">
                  {location?.name ?? t("mapUnknownStorageLocation")}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("mapEditorHelp", { count: state.document.walls.length + state.document.shapes.length })}
      </p>
    </div>
  );
};
