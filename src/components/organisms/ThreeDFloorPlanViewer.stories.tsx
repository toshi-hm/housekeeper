import type { Meta, StoryObj } from "@storybook/react";

import { ThreeDFloorPlanViewer } from "./ThreeDFloorPlanViewer";

const meta = {
  component: ThreeDFloorPlanViewer,
  tags: ["autodocs"],
  // WebGL(three.js canvas)のレンダリングはヘッドレスChromiumのソフトウェア/GPU
  // ラスタライザの実行のたびのブレ（アンチエイリアス・ライティング等）で、同一
  // コード・同一環境でも実行ごとにスクリーンショットが40%前後変動することを確認
  // した（failureThreshold: 2%を大幅に超える）。VRT(#807)対象から除外する。
  parameters: { layout: "padded", vrt: { disable: true } },
} satisfies Meta<typeof ThreeDFloorPlanViewer>;

export default meta;
type Story = StoryObj<typeof meta>;

const document = {
  schemaVersion: 1 as const,
  units: "cm" as const,
  width: 600,
  height: 400,
  gridSize: 10,
  walls: [{ id: "wall-1", start: { x: 50, y: 50 }, end: { x: 550, y: 50 }, thickness: 8 }],
  shapes: [
    {
      id: "shape-1",
      kind: "rectangle" as const,
      x: 120,
      y: 100,
      width: 180,
      height: 100,
      rotation: 0,
      label: "棚",
    },
  ],
};

export const Default: Story = {
  args: { document },
};

export const WithStorageLocations: Story = {
  args: {
    document,
    storageLocations: [
      {
        id: "location-1",
        user_id: "user-1",
        name: "冷蔵庫",
        photo_path: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    storageLocationMarkers: [
      {
        id: "marker-1",
        user_id: "user-1",
        floor_plan_id: "plan-1",
        storage_location_id: "location-1",
        object_id: "shape-1",
        x: 150,
        y: 140,
        z: 0,
        rotation: 0,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    // #988: 保管場所マーカー・一覧をクリック/タップすると該当保管場所へ遷移できる。
    onStorageLocationClick: () => {},
  },
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
