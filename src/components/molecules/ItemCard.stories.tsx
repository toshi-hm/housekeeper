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
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

export const Default: Story = {
  args: {
    item: {
      ...baseItem,
      name: "Organic Milk",
      category: "Food",
      quantity: 2,
      barcode: "4901234567890",
      storage_location: "Fridge",
      expiry_date: "2099-12-31",
      purchase_date: "2024-01-01",
      notes: null,
      image_url: null,
    },
  },
};

export const ExpiringSoon: Story = {
  args: {
    item: {
      ...baseItem,
      name: "Yogurt",
      category: "Food",
      quantity: 1,
      barcode: null,
      storage_location: "Fridge",
      expiry_date: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
      purchase_date: null,
      notes: null,
      image_url: null,
    },
  },
};

export const Expired: Story = {
  args: {
    item: {
      ...baseItem,
      name: "Old Cheese",
      category: "Food",
      quantity: 1,
      barcode: null,
      storage_location: null,
      expiry_date: "2020-01-01",
      purchase_date: null,
      notes: null,
      image_url: null,
    },
  },
};

export const NoImage: Story = {
  args: {
    item: {
      ...baseItem,
      name: "Shampoo",
      category: "Personal Care",
      quantity: 3,
      barcode: null,
      storage_location: "Bathroom shelf",
      expiry_date: null,
      purchase_date: null,
      notes: null,
      image_url: null,
    },
  },
};

export const WithImage: Story = {
  args: {
    item: {
      ...baseItem,
      name: "Orange Juice",
      category: "Beverages",
      quantity: 1,
      barcode: null,
      storage_location: "Fridge",
      expiry_date: "2099-06-01",
      purchase_date: null,
      notes: null,
      image_url: "https://placehold.co/400x400/orange/white?text=OJ",
    },
  },
};
