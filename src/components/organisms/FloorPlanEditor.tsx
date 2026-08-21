import { useReducer, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
  clampWallTranslation,
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

// Tracks an in-progress drag-to-move of an already-placed wall or shape.
// `pointerStart`/origin coordinates let us compute a delta on every pointer
// move without dispatching on each frame — the reducer action (and its undo
// entry) only fires once, on pointer up, matching how new-shape drawing
// commits once instead of on every move.
type DragState =
  | {
      kind: "shape";
      id: string;
      pointerId: number;
      pointerStart: Point;
      origin: Point;
    }
  | {
      kind: "wall";
      id: string;
      pointerId: number;
      pointerStart: Point;
      origin: { start: Point; end: Point };
    };

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
  const [drag, setDrag] = useState<DragState | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Reads a client-space pointer position off the current svgRef rather than
  // event.currentTarget, so it works both for handlers bound to the <svg>
  // itself (drawing) and for handlers bound to a nested wall/shape element
  // (dragging an existing one) without picking up that element's own,
  // much smaller, bounding rect.
  const getPoint = (clientX: number, clientY: number): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const scaleX = state.document.width / rect.width;
    const scaleY = state.document.height / rect.height;
    return {
      x: snapToGrid((clientX - rect.left) * scaleX, state.document.gridSize, state.document.width),
      y: snapToGrid((clientY - rect.top) * scaleY, state.document.gridSize, state.document.height),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (isMarkerMode) {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setCurrentPoint(getPoint(event.clientX, event.clientY));
      return;
    }
    if (tool === "select") return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const point = getPoint(event.clientX, event.clientY);
    setStart(point);
    setCurrentPoint(point);
  };

  const handleShapePointerDown = (event: React.PointerEvent<SVGGElement>, shapeId: string) => {
    dispatch({ type: "select", id: shapeId, kind: "shape" });
    if (tool !== "select" || isMarkerMode) return;
    const shape = state.document.shapes.find((candidate) => candidate.id === shapeId);
    if (!shape) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({
      kind: "shape",
      id: shapeId,
      pointerId: event.pointerId,
      pointerStart: getPoint(event.clientX, event.clientY),
      origin: { x: shape.x, y: shape.y },
    });
  };

  const handleWallPointerDown = (event: React.PointerEvent<SVGLineElement>, wallId: string) => {
    dispatch({ type: "select", id: wallId, kind: "wall" });
    if (tool !== "select" || isMarkerMode) return;
    const wall = state.document.walls.find((candidate) => candidate.id === wallId);
    if (!wall) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({
      kind: "wall",
      id: wallId,
      pointerId: event.pointerId,
      pointerStart: getPoint(event.clientX, event.clientY),
      origin: { start: wall.start, end: wall.end },
    });
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (isMarkerMode || start) setCurrentPoint(getPoint(event.clientX, event.clientY));
    if (drag && event.pointerId === drag.pointerId) {
      setCurrentPoint(getPoint(event.clientX, event.clientY));
    }
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (isMarkerMode) {
      onStorageLocationMarkerChange?.(getPoint(event.clientX, event.clientY));
      setIsMarkerMode(false);
      setCurrentPoint(null);
      return;
    }
    if (drag && event.pointerId === drag.pointerId) {
      const point = getPoint(event.clientX, event.clientY);
      const dx = point.x - drag.pointerStart.x;
      const dy = point.y - drag.pointerStart.y;
      if (dx !== 0 || dy !== 0) {
        if (drag.kind === "shape") {
          const shape = state.document.shapes.find((candidate) => candidate.id === drag.id);
          const maxX = shape
            ? Math.max(0, state.document.width - shape.width)
            : state.document.width;
          const maxY = shape
            ? Math.max(0, state.document.height - shape.height)
            : state.document.height;
          dispatch({
            type: "move-shape",
            id: drag.id,
            x: snapToGrid(drag.origin.x + dx, state.document.gridSize, maxX),
            y: snapToGrid(drag.origin.y + dy, state.document.gridSize, maxY),
          });
        } else {
          const clamped = clampWallTranslation(
            drag.origin,
            dx,
            dy,
            state.document.width,
            state.document.height,
          );
          dispatch({
            type: "move-wall",
            id: drag.id,
            start: {
              x: snapToGrid(drag.origin.start.x + clamped.dx, state.document.gridSize),
              y: snapToGrid(drag.origin.start.y + clamped.dy, state.document.gridSize),
            },
            end: {
              x: snapToGrid(drag.origin.end.x + clamped.dx, state.document.gridSize),
              y: snapToGrid(drag.origin.end.y + clamped.dy, state.document.gridSize),
            },
          });
        }
      }
      setDrag(null);
      setCurrentPoint(null);
      return;
    }
    if (!start || tool === "select") return;
    const end = getPoint(event.clientX, event.clientY);
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
    setDrag(null);
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
    } else if (
      (event.key === "ArrowUp" ||
        event.key === "ArrowDown" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight") &&
      state.selectedId &&
      state.selectedKind
    ) {
      // Keyboard alternative to pointer drag, for shapes/walls that are
      // hard to nudge precisely (or reach at all) with a pointer — moves
      // by one grid step per press.
      event.preventDefault();
      const step = state.document.gridSize;
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      if (state.selectedKind === "shape") {
        const shape = state.document.shapes.find((candidate) => candidate.id === state.selectedId);
        if (shape) {
          const maxX = Math.max(0, state.document.width - shape.width);
          const maxY = Math.max(0, state.document.height - shape.height);
          dispatch({
            type: "move-shape",
            id: shape.id,
            x: snapToGrid(shape.x + dx, step, maxX),
            y: snapToGrid(shape.y + dy, step, maxY),
          });
        }
      } else {
        const wall = state.document.walls.find((candidate) => candidate.id === state.selectedId);
        if (wall) {
          const clamped = clampWallTranslation(
            wall,
            dx,
            dy,
            state.document.width,
            state.document.height,
          );
          dispatch({
            type: "move-wall",
            id: wall.id,
            start: {
              x: snapToGrid(wall.start.x + clamped.dx, step),
              y: snapToGrid(wall.start.y + clamped.dy, step),
            },
            end: {
              x: snapToGrid(wall.end.x + clamped.dx, step),
              y: snapToGrid(wall.end.y + clamped.dy, step),
            },
          });
        }
      }
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
          ref={svgRef}
          viewBox={`0 0 ${state.document.width} ${state.document.height}`}
          // Only opt out of native touch scrolling while a gesture on the
          // canvas actually means something (drawing a wall/shape, placing
          // a marker, or dragging an existing wall/shape). In "select" mode
          // with nothing being dragged, `touch-none` unconditionally here
          // blocked the only way to pan this min-w-[480px] canvas into view
          // on phones narrower than that (#819 review). While `drag` is set,
          // touch-none is required or the browser's own pan gesture fights
          // the JS-driven drag on touch devices (#870 review).
          className={`h-auto min-h-80 w-full min-w-[480px] ${
            tool === "select" && !isMarkerMode && !drag ? "touch-auto" : "touch-none"
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
          {state.document.walls.map((wall) => {
            // While this wall is being dragged, render it at the live
            // pointer offset (clamped/snapped the same way the eventual
            // move-wall dispatch will be) instead of its committed
            // position — the reducer itself isn't touched until pointer up.
            const isDragging = drag?.kind === "wall" && drag.id === wall.id && currentPoint;
            const rawDx = isDragging ? currentPoint.x - drag.pointerStart.x : 0;
            const rawDy = isDragging ? currentPoint.y - drag.pointerStart.y : 0;
            const clamped = isDragging
              ? clampWallTranslation(
                  drag.origin,
                  rawDx,
                  rawDy,
                  state.document.width,
                  state.document.height,
                )
              : { dx: 0, dy: 0 };
            const wallStart = isDragging
              ? {
                  x: snapToGrid(drag.origin.start.x + clamped.dx, state.document.gridSize),
                  y: snapToGrid(drag.origin.start.y + clamped.dy, state.document.gridSize),
                }
              : wall.start;
            const wallEnd = isDragging
              ? {
                  x: snapToGrid(drag.origin.end.x + clamped.dx, state.document.gridSize),
                  y: snapToGrid(drag.origin.end.y + clamped.dy, state.document.gridSize),
                }
              : wall.end;
            return (
              <line
                key={wall.id}
                x1={wallStart.x}
                y1={wallStart.y}
                x2={wallEnd.x}
                y2={wallEnd.y}
                stroke={state.selectedId === wall.id ? "hsl(var(--destructive))" : "currentColor"}
                strokeWidth={wall.thickness}
                strokeLinecap="round"
                className={tool === "select" ? "cursor-move" : undefined}
                onPointerDown={(event) => handleWallPointerDown(event, wall.id)}
              />
            );
          })}
          {state.document.shapes.map((shape) => {
            // Same live-preview treatment as walls, for the shape being
            // dragged (rectangle/circle/label all share x/y/width/height).
            const isDragging = drag?.kind === "shape" && drag.id === shape.id && currentPoint;
            const dx = isDragging ? currentPoint.x - drag.pointerStart.x : 0;
            const dy = isDragging ? currentPoint.y - drag.pointerStart.y : 0;
            const maxX = Math.max(0, state.document.width - shape.width);
            const maxY = Math.max(0, state.document.height - shape.height);
            const shapeX = isDragging
              ? snapToGrid(drag.origin.x + dx, state.document.gridSize, maxX)
              : shape.x;
            const shapeY = isDragging
              ? snapToGrid(drag.origin.y + dy, state.document.gridSize, maxY)
              : shape.y;
            return (
              <g
                key={shape.id}
                transform={`rotate(${shape.rotation} ${shapeX + shape.width / 2} ${shapeY + shape.height / 2})`}
                className={tool === "select" ? "cursor-move" : undefined}
                onPointerDown={(event) => handleShapePointerDown(event, shape.id)}
              >
                <rect
                  x={shapeX}
                  y={shapeY}
                  width={shape.width}
                  height={shape.height}
                  rx="4"
                  fill={
                    state.selectedId === shape.id
                      ? "hsl(var(--destructive) / 0.16)"
                      : "hsl(var(--primary) / 0.12)"
                  }
                  stroke={
                    state.selectedId === shape.id
                      ? "hsl(var(--destructive))"
                      : "hsl(var(--primary))"
                  }
                  strokeWidth="2"
                />
                {shape.label && (
                  <text x={shapeX + 4} y={shapeY + 16} fontSize="12" fill="currentColor">
                    {shape.label}
                  </text>
                )}
              </g>
            );
          })}
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
