import type { Meta, StoryObj } from "@storybook/react";

import { withRouter } from "../../../.storybook/routerDecorator";
import { ItemListRow } from "./ItemListRow";

const meta = {
  component: ItemListRow,
  tags: ["autodocs"],
  decorators: [withRouter],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ItemListRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const baseItem = {
  id: "1",
  user_id: "u1",
  units: 2,
  content_amount: 500,
  content_unit: "mL",
  opened_remaining: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

export const Default: Story = {
  args: {
    item: {
      ...baseItem,
      name: "Organic Milk",
      category_id: null,
      barcode: "4901234567890",
      storage_location_id: null,
      expiry_date: "2099-12-31",
      purchase_date: "2024-01-01",
      notes: null,
      image_path: null,
    },
  },
};

export const ExpiringSoon: Story = {
  args: {
    item: {
      ...baseItem,
      name: "ヨーグルト",
      units: 1,
      category_id: null,
      barcode: null,
      storage_location_id: null,
      expiry_date: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
      purchase_date: null,
      notes: null,
      image_path: null,
    },
  },
};

export const Expired: Story = {
  args: {
    item: {
      ...baseItem,
      name: "古いチーズ",
      units: 1,
      category_id: null,
      barcode: null,
      storage_location_id: null,
      expiry_date: "2020-01-01",
      purchase_date: null,
      notes: null,
      image_path: null,
    },
  },
};

export const EmptyStock: Story = {
  args: {
    item: {
      ...baseItem,
      name: "シャンプー",
      units: 0,
      content_amount: 400,
      content_unit: "mL",
      category_id: null,
      barcode: null,
      storage_location_id: null,
      expiry_date: null,
      purchase_date: null,
      notes: null,
      image_path: null,
    },
  },
};

export const WithOpenedRemaining: Story = {
  args: {
    item: {
      ...baseItem,
      name: "牛乳",
      units: 3,
      content_amount: 1000,
      content_unit: "mL",
      opened_remaining: 350,
      category_id: null,
      barcode: null,
      storage_location_id: null,
      expiry_date: "2099-06-01",
      purchase_date: null,
      notes: null,
      image_path: null,
    },
  },
};

const selectableItem = {
  ...baseItem,
  name: "牛乳",
  category_id: null,
  barcode: null,
  storage_location_id: null,
  expiry_date: "2099-06-01",
  purchase_date: null,
  notes: null,
  image_path: null,
};

export const SelectionModeUnselected: Story = {
  args: {
    item: selectableItem,
    selectionMode: true,
    isSelected: false,
    onToggleSelect: () => {},
  },
};

export const SelectionModeSelected: Story = {
  args: {
    item: selectableItem,
    selectionMode: true,
    isSelected: true,
    onToggleSelect: () => {},
  },
};
