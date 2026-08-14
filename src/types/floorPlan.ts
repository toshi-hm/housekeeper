import { z } from "zod";

const pointSchema = z.object({
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
});

const baseShapeSchema = z.object({
  id: z.string().min(1),
  x: z.number().finite().nonnegative(),
  y: z.number().finite().nonnegative(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
  rotation: z.number().finite().default(0),
  label: z.string().max(80).nullable().default(null),
});

const floorPlanShapeSchema = z.discriminatedUnion("kind", [
  baseShapeSchema.extend({ kind: z.literal("rectangle") }),
  baseShapeSchema.extend({ kind: z.literal("circle") }),
  baseShapeSchema.extend({ kind: z.literal("label") }),
]);

const floorPlanWallSchema = z.object({
  id: z.string().min(1),
  start: pointSchema,
  end: pointSchema,
  thickness: z.number().finite().positive(),
});

export const floorPlanDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  units: z.literal("cm"),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
  gridSize: z.number().finite().positive(),
  walls: z.array(floorPlanWallSchema).max(1000),
  shapes: z.array(floorPlanShapeSchema).max(1000),
});

export type FloorPlanShape = z.infer<typeof floorPlanShapeSchema>;
export type FloorPlanWall = z.infer<typeof floorPlanWallSchema>;
export type FloorPlanDocument = z.infer<typeof floorPlanDocumentSchema>;

export interface FloorPlan {
  id: string;
  user_id: string;
  /** Deprecated compatibility field for pre-shared-plan clients. */
  storage_location_id?: string | null;
  name: string;
  schema_version: number;
  document: FloorPlanDocument;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface FloorPlanStorageLocationMarker {
  id: string;
  user_id: string;
  floor_plan_id: string;
  storage_location_id: string;
  object_id: string | null;
  x: number;
  y: number;
  z: number;
  rotation: number;
  created_at: string;
  updated_at: string;
}

export interface FloorPlanItemPlacement {
  id: string;
  user_id: string;
  floor_plan_id: string;
  item_id: string;
  object_id: string | null;
  x: number;
  y: number;
  z: number;
  rotation: number;
  created_at: string;
  updated_at: string;
}

export const createEmptyFloorPlanDocument = (): FloorPlanDocument => ({
  schemaVersion: 1,
  units: "cm",
  width: 600,
  height: 400,
  gridSize: 10,
  walls: [],
  shapes: [],
});

export const parseFloorPlanDocument = (value: unknown): FloorPlanDocument =>
  floorPlanDocumentSchema.parse(value);
