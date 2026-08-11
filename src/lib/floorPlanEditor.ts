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
    case "delete-selected":
      return withHistory(state, {
        ...state.document,
        walls: removeById(state.document.walls, state.selectedId),
        shapes: removeById(state.document.shapes, state.selectedId),
      });
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

export const snapToGrid = (value: number, gridSize: number): number =>
  Math.max(0, Math.round(value / gridSize) * gridSize);

export const normalizeRect = (
  start: { x: number; y: number },
  end: { x: number; y: number },
  gridSize: number,
) => ({
  x: snapToGrid(Math.min(start.x, end.x), gridSize),
  y: snapToGrid(Math.min(start.y, end.y), gridSize),
  width: snapToGrid(Math.abs(end.x - start.x), gridSize),
  height: snapToGrid(Math.abs(end.y - start.y), gridSize),
});
