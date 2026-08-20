import { describe, expect, it } from "bun:test";

import { createEmptyFloorPlanDocument } from "@/types/floorPlan";

import {
  createFloorPlanEditorState,
  floorPlanEditorReducer,
  normalizeRect,
  snapToGrid,
} from "./floorPlanEditor";

describe("floorPlanEditor", () => {
  it("snaps values to the nearest grid", () => {
    expect(snapToGrid(14, 10)).toBe(10);
    expect(snapToGrid(16, 10)).toBe(20);
  });

  it("clamps snapped values to the nearest grid line at or below max, when given", () => {
    // A pointer past the canvas edge (setPointerCapture keeps delivering
    // events outside the element's bounds) must not produce a coordinate
    // beyond the document — it would be clipped by the SVG viewBox and
    // become unselectable.
    expect(snapToGrid(595, 10, 500)).toBe(500);
    expect(snapToGrid(505, 10, 500)).toBe(500);
    expect(snapToGrid(120, 10, 500)).toBe(120);
  });

  it("normalizes a rectangle drawn from bottom right to top left", () => {
    expect(normalizeRect({ x: 95, y: 85 }, { x: 15, y: 25 }, 10)).toEqual({
      x: 20,
      y: 30,
      width: 80,
      height: 60,
    });
  });

  it("supports add, undo, and redo", () => {
    const initial = createFloorPlanEditorState(createEmptyFloorPlanDocument());
    const withShape = floorPlanEditorReducer(initial, {
      type: "add-shape",
      shape: {
        id: "shape-1",
        kind: "rectangle",
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        rotation: 0,
        label: null,
      },
    });
    expect(withShape.document.shapes).toHaveLength(1);
    const undone = floorPlanEditorReducer(withShape, { type: "undo" });
    expect(undone.document.shapes).toHaveLength(0);
    const redone = floorPlanEditorReducer(undone, { type: "redo" });
    expect(redone.document.shapes).toHaveLength(1);
  });

  it("clears the selection after delete-selected, so repeated Delete presses are no-ops", () => {
    const initial = createFloorPlanEditorState(createEmptyFloorPlanDocument());
    const withShape = floorPlanEditorReducer(initial, {
      type: "add-shape",
      shape: {
        id: "shape-1",
        kind: "rectangle",
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        rotation: 0,
        label: null,
      },
    });
    const selected = floorPlanEditorReducer(withShape, {
      type: "select",
      id: "shape-1",
      kind: "shape",
    });
    const deleted = floorPlanEditorReducer(selected, { type: "delete-selected" });
    expect(deleted.document.shapes).toHaveLength(0);
    expect(deleted.selectedId).toBeNull();
    expect(deleted.selectedKind).toBeNull();

    // With no selection left, a second delete-selected must not push another
    // (no-op) entry onto the undo stack (#819 review) — otherwise Undo would
    // restore this already-empty state instead of the shape.
    const deletedAgain = floorPlanEditorReducer(deleted, { type: "delete-selected" });
    expect(deletedAgain.undoStack).toHaveLength(deleted.undoStack.length);
  });

  it("moves a shape to new coordinates and supports undoing the move (#870)", () => {
    const initial = createFloorPlanEditorState(createEmptyFloorPlanDocument());
    const withShape = floorPlanEditorReducer(initial, {
      type: "add-shape",
      shape: {
        id: "shape-1",
        kind: "rectangle",
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        rotation: 0,
        label: null,
      },
    });
    const moved = floorPlanEditorReducer(withShape, {
      type: "move-shape",
      id: "shape-1",
      x: 50,
      y: 60,
    });
    expect(moved.document.shapes).toEqual([
      expect.objectContaining({ id: "shape-1", x: 50, y: 60 }),
    ]);
    // Other shapes are left untouched, and a move is a normal history entry.
    const undone = floorPlanEditorReducer(moved, { type: "undo" });
    expect(undone.document.shapes).toEqual([
      expect.objectContaining({ id: "shape-1", x: 10, y: 10 }),
    ]);
  });

  it("moves a wall's endpoints and supports undoing the move (#870)", () => {
    const initial = createFloorPlanEditorState(createEmptyFloorPlanDocument());
    const withWall = floorPlanEditorReducer(initial, {
      type: "add-wall",
      wall: { id: "wall-1", start: { x: 0, y: 0 }, end: { x: 100, y: 0 }, thickness: 8 },
    });
    const moved = floorPlanEditorReducer(withWall, {
      type: "move-wall",
      id: "wall-1",
      start: { x: 20, y: 40 },
      end: { x: 120, y: 40 },
    });
    expect(moved.document.walls).toEqual([
      expect.objectContaining({
        id: "wall-1",
        start: { x: 20, y: 40 },
        end: { x: 120, y: 40 },
      }),
    ]);
    const undone = floorPlanEditorReducer(moved, { type: "undo" });
    expect(undone.document.walls).toEqual([
      expect.objectContaining({ id: "wall-1", start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }),
    ]);
  });
});
