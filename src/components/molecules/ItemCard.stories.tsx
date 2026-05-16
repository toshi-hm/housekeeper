import type { Meta, StoryObj } from "@storybook/react";

import { withRouter } from "../../../.storybook/routerDecorator";
import { ItemCard } from "./ItemCard";

const meta = {
  component: ItemCard,
  tags: ["autodocs"],
  decorators: [withRouter],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ItemCard>;

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
    categoryName: "食品",
    locationName: "冷蔵庫",
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

export const NoExpiry: Story = {
  args: {
    item: {
      ...baseItem,
      name: "オレンジジュース",
      units: 1,
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
    categoryName: "食品",
    locationName: "冷蔵庫",
  },
};

export const CountUnit: Story = {
  args: {
    item: {
      ...baseItem,
      name: "コーヒーカプセル",
      units: 12,
      content_amount: 1,
      content_unit: "個",
      opened_remaining: null,
      category_id: null,
      barcode: null,
      storage_location_id: null,
      expiry_date: "2099-12-31",
      purchase_date: null,
      notes: null,
      image_path: null,
    },
  },
};

export const MultiLotStacked: Story = {
  args: {
    item: {
      ...baseItem,
      name: "シャンプー",
      units: 5,
      content_amount: 400,
      content_unit: "mL",
      opened_remaining: null,
      category_id: null,
      barcode: null,
      storage_location_id: null,
      expiry_date: "2099-06-01",
      purchase_date: null,
      notes: null,
      image_path: null,
    },
    locationName: "洗面台",
  },
};
