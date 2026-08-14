import { describe, expect, it } from "bun:test";

import {
  createEmptyFloorPlanDocument,
  floorPlanDocumentSchema,
  parseFloorPlanDocument,
} from "./floorPlan";

describe("floorPlanDocumentSchema", () => {
  it("creates a valid empty document", () => {
    expect(parseFloorPlanDocument(createEmptyFloorPlanDocument()).schemaVersion).toBe(1);
  });

  it("rejects unsupported schema versions", () => {
    const result = floorPlanDocumentSchema.safeParse({
      ...createEmptyFloorPlanDocument(),
      schemaVersion: 2,
    });
    expect(result.success).toBe(false);
  });

  it("rejects negative coordinates and zero wall thickness", () => {
    const result = floorPlanDocumentSchema.safeParse({
      ...createEmptyFloorPlanDocument(),
      walls: [
        {
          id: "wall-1",
          start: { x: -1, y: 0 },
          end: { x: 10, y: 10 },
          thickness: 0,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
