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
import type { FloorPlanDocument } from "@/types/floorPlan";

interface FloorPlanEditorProps {
  initialDocument: FloorPlanDocument;
  onSave: (document: FloorPlanDocument) => void;
  isSaving?: boolean;
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
    if (tool === "select") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setStart(getPoint(event));
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
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
    setTool("select");
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
      setStart(null);
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
      <div className="overflow-auto rounded-lg border bg-muted/20 p-2">
        <svg
          viewBox={`0 0 ${state.document.width} ${state.document.height}`}
          className="h-auto min-h-80 w-full min-w-[480px] touch-none"
          role="application"
          tabIndex={0}
          aria-label={t("mapEditorAriaLabel")}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
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
        </svg>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("mapEditorHelp", { count: state.document.walls.length + state.document.shapes.length })}
      </p>
    </div>
  );
};
