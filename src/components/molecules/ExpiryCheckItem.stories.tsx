import type { Meta, StoryObj } from "@storybook/react";

import { ExpiryCheckItem } from "./ExpiryCheckItem";

const baseItem = {
  id: "item-1",
  user_id: "user-1",
  name: "特濃ヨーグルト 400g",
  barcode: null,
  category_id: null,
  storage_location_id: null,
  units: 1,
  content_amount: 1,
  content_unit: "個",
  opened_remaining: null,
  purchase_date: null,
  expiry_date: "2026-05-20",
  image_path: null,
  notes: null,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
  deleted_at: null,
};

const meta = {
  component: ExpiryCheckItem,
  tags: ["autodocs"],
  args: {
    onCheck: async () => {},
  },
} satisfies Meta<typeof ExpiryCheckItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    item: baseItem,
    categoryColor: "#22c55e",
  },
};

export const LongName: Story = {
  args: {
    item: {
      ...baseItem,
      id: "item-2",
      name: "北海道産ミルク使用 プレミアム無糖ヨーグルト ファミリーサイズ たんぱく質強化タイプ",
    },
    categoryColor: "#3b82f6",
  },
};
