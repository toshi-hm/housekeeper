import type { Meta, StoryObj } from "@storybook/react";

import {
  createEmptyFloorPlanDocument,
  type FloorPlanStorageLocationMarker,
} from "@/types/floorPlan";
import type { StorageLocation } from "@/types/item";

import { FloorPlanEditor } from "./FloorPlanEditor";

const meta = {
  component: FloorPlanEditor,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof FloorPlanEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    initialDocument: createEmptyFloorPlanDocument(),
    onSave: () => undefined,
  },
};

export const Saving: Story = {
  args: {
    initialDocument: createEmptyFloorPlanDocument(),
    onSave: () => undefined,
    isSaving: true,
  },
};

const storageLocations: StorageLocation[] = [
  {
    id: "location-1",
    user_id: "user-1",
    name: "冷蔵庫",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "location-2",
    user_id: "user-1",
    name: "パントリー",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const storageLocationMarkers: FloorPlanStorageLocationMarker[] = [
  {
    id: "marker-1",
    user_id: "user-1",
    floor_plan_id: "plan-1",
    storage_location_id: "location-1",
    object_id: null,
    x: 120,
    y: 80,
    z: 0,
    rotation: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

// #1034: with a marker already placed at the selected storage location, the
// "delete marker" affordance next to "place marker" is enabled.
export const WithStorageLocationMarker: Story = {
  args: {
    initialDocument: createEmptyFloorPlanDocument(),
    onSave: () => undefined,
    storageLocations,
    storageLocationMarkers,
    selectedStorageLocationId: "location-1",
    onSelectStorageLocation: () => undefined,
    onStorageLocationMarkerChange: () => undefined,
    onDeleteStorageLocationMarker: () => undefined,
  },
};

// Selecting a storage location with no marker yet disables the delete
// affordance — only "place marker" is available.
export const StorageLocationWithoutMarker: Story = {
  args: {
    initialDocument: createEmptyFloorPlanDocument(),
    onSave: () => undefined,
    storageLocations,
    storageLocationMarkers,
    selectedStorageLocationId: "location-2",
    onSelectStorageLocation: () => undefined,
    onStorageLocationMarkerChange: () => undefined,
    onDeleteStorageLocationMarker: () => undefined,
  },
};
