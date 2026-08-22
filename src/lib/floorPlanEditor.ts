import type { FloorPlanDocument, FloorPlanShape, FloorPlanWall } from "@/types/floorPlan";

export type FloorPlanTool = "select" | "wall" | "rectangle" | "circle" | "label";

export interface FloorPlanEditorState {
  document: FloorPlanDocument;
  selectedId: string | null;
  selectedKind: "wall" | "shape" | null;
  undoStack: FloorPlanDocument[];
  redoStack: FloorPlanDocument[];
}

export type FloorPlanEditorAction =
  | { type: "replace"; document: FloorPlanDocument }
  | { type: "select"; id: string | null; kind: "wall" | "shape" | null }
  | { type: "add-wall"; wall: FloorPlanWall }
  | { type: "add-shape"; shape: FloorPlanShape }
  | { type: "move-shape"; id: string; x: number; y: number }
  | {
      type: "move-wall";
      id: string;
      start: { x: number; y: number };
      end: { x: number; y: number };
    }
  | { type: "delete-selected" }
  | { type: "undo" }
  | { type: "redo" };

const withHistory = (
  state: FloorPlanEditorState,
  document: FloorPlanDocument,
): FloorPlanEditorState => ({
  ...state,
  document,
  undoStack: [...state.undoStack, state.document],
  redoStack: [],
});

const removeById = <T extends { id: string }>(items: T[], id: string | null): T[] =>
  id ? items.filter((item) => item.id !== id) : items;

export const createFloorPlanEditorState = (document: FloorPlanDocument): FloorPlanEditorState => ({
  document,
  selectedId: null,
  selectedKind: null,
  undoStack: [],
  redoStack: [],
});

export const floorPlanEditorReducer = (
  state: FloorPlanEditorState,
  action: FloorPlanEditorAction,
): FloorPlanEditorState => {
  switch (action.type) {
    case "replace":
      return createFloorPlanEditorState(action.document);
    case "select":
      return { ...state, selectedId: action.id, selectedKind: action.kind };
    case "add-wall":
      return withHistory(state, {
        ...state.document,
        walls: [...state.document.walls, action.wall],
      });
    case "add-shape":
      return withHistory(state, {
        ...state.document,
        shapes: [...state.document.shapes, action.shape],
      });
    case "move-shape":
      return withHistory(state, {
        ...state.document,
        shapes: state.document.shapes.map((shape) =>
          shape.id === action.id ? { ...shape, x: action.x, y: action.y } : shape,
        ),
      });
    case "move-wall":
      return withHistory(state, {
        ...state.document,
        walls: state.document.walls.map((wall) =>
          wall.id === action.id ? { ...wall, start: action.start, end: action.end } : wall,
        ),
      });
    case "delete-selected":
      // Also guard on selectedId here (not just clear it below): the
      // Delete/Backspace key handler dispatches this unconditionally, so
      // without the guard, pressing it with nothing selected would still
      // push a content-identical entry onto undoStack and wipe redoStack.
      if (!state.selectedId) return state;
      return {
        ...withHistory(state, {
          ...state.document,
          walls: removeById(state.document.walls, state.selectedId),
          shapes: removeById(state.document.shapes, state.selectedId),
        }),
        selectedId: null,
        selectedKind: null,
      };
    case "undo": {
      const previous = state.undoStack.at(-1);
      if (!previous) return state;
      return {
        ...state,
        document: previous,
        selectedId: null,
        selectedKind: null,
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [state.document, ...state.redoStack],
      };
    }
    case "redo": {
      const next = state.redoStack[0];
      if (!next) return state;
      return {
        ...state,
        document: next,
        selectedId: null,
        selectedKind: null,
        undoStack: [...state.undoStack, state.document],
        redoStack: state.redoStack.slice(1),
      };
    }
    default:
      return action satisfies never;
  }
};

// `max`, when given, clamps the snapped value to the nearest grid line at or
// below it — callers pass the document's width/height so a pointer position
// outside the canvas (setPointerCapture keeps delivering move events past
// its edges, e.g. while auto-scrolling a viewport narrower than the
// editor's min-w-[480px]) can't produce a wall/shape/marker coordinate
// beyond the document bounds. Out-of-bounds coordinates would be clipped by
// the SVG's `viewBox="0 0 width height"` — invisible and, since nothing
// on-canvas exists to click, unselectable/undeletable from the UI.
export const snapToGrid = (value: number, gridSize: number, max?: number): number => {
  const snapped = Math.max(0, Math.round(value / gridSize) * gridSize);
  return max !== undefined ? Math.min(snapped, Math.floor(max / gridSize) * gridSize) : snapped;
};

// A wall has two independent endpoints, so clamping each one to
// [0, width]/[0, height] separately (as snapToGrid alone would) can distort
// the wall's length/angle when a drag or keyboard nudge pushes only one
// endpoint past a document edge — the other keeps moving by the full delta
// while the clamped one stops short. Clamping the shared dx/dy instead keeps
// both endpoints moving together as a rigid translation, so the wall only
// ever stops moving (never stretches) at the boundary (#870 review).
export const clampWallTranslation = (
  origin: { start: { x: number; y: number }; end: { x: number; y: number } },
  dx: number,
  dy: number,
  width: number,
  height: number,
): { dx: number; dy: number } => {
  const minX = Math.min(origin.start.x, origin.end.x);
  const maxX = Math.max(origin.start.x, origin.end.x);
  const minY = Math.min(origin.start.y, origin.end.y);
  const maxY = Math.max(origin.start.y, origin.end.y);
  return {
    dx: Math.min(Math.max(dx, -minX), width - maxX),
    dy: Math.min(Math.max(dy, -minY), height - maxY),
  };
};

export const normalizeRect = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  gridSize: number,
  bounds?: { width: number; height: number },
) => ({
  x: snapToGrid(Math.min(start.x, end.x), gridSize, bounds?.width),
  y: snapToGrid(Math.min(start.y, end.y), gridSize, bounds?.height),
  width: snapToGrid(Math.abs(end.x - start.x), gridSize, bounds?.width),
  height: snapToGrid(Math.abs(end.y - start.y), gridSize, bounds?.height),
});
