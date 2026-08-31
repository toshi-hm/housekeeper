import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

import { FloorPlanViewer } from "./FloorPlanViewer";

const document = {
  schemaVersion: 1 as const,
  units: "cm" as const,
  width: 600,
  height: 400,
  gridSize: 10,
  walls: [{ id: "wall-1", start: { x: 40, y: 40 }, end: { x: 560, y: 40 }, thickness: 8 }],
  shapes: [
    {
      id: "shape-1",
      kind: "rectangle" as const,
      x: 100,
      y: 100,
      width: 160,
      height: 90,
      rotation: 0,
      label: "冷蔵庫",
    },
  ],
};

const meta = {
  component: FloorPlanViewer,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof FloorPlanViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { document },
};

export const WithPlacedItems: Story = {
  args: {
    document,
    items: [
      {
        id: "item-1",
        name: "牛乳",
        barcode: null,
        category_id: null,
        storage_location_id: "location-1",
        units: 1,
        content_amount: 1,
        content_unit: "個",
        opened_remaining: null,
        purchase_date: null,
        expiry_date: null,
        expiry_type: null,
        notes: null,
        image_path: null,
        minimum_stock: null,
        auto_reorder: false,
        reorder_threshold: null,
        last_verified_at: null,
        deleted_at: null,
        deletion_reason: null,
        pin_x: null,
        pin_y: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        user_id: "user-1",
      },
    ],
    placements: [
      {
        id: "placement-1",
        user_id: "user-1",
        floor_plan_id: "plan-1",
        item_id: "item-1",
        object_id: "shape-1",
        x: 150,
        y: 140,
        z: 0,
        rotation: 0,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
  },
};

export const Empty: Story = {
  args: {
    document: { ...document, walls: [], shapes: [] },
  },
};

export const WithRemovablePlacement: Story = {
  args: {
    ...WithPlacedItems.args,
    onRemovePlacement: fn(),
  },
};
