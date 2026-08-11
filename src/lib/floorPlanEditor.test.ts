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
});
