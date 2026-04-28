import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

import { ItemForm } from "./ItemForm";

const meta = {
  component: ItemForm,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: {
    onSubmit: fn(),
  },
} satisfies Meta<typeof ItemForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithDefaultValues: Story = {
  args: {
    defaultValues: {
      name: "Organic Milk",
      barcode: "4901234567890",
      category: "Food",
      quantity: 2,
      storage_location: "Fridge",
      purchase_date: "2024-01-01",
      expiry_date: "2099-12-31",
      notes: "From local farm",
    },
    submitLabel: "Save Changes",
  },
};

export const Submitting: Story = {
  args: {
    defaultValues: {
      name: "Shampoo",
      category: "Personal Care",
      quantity: 1,
    },
    isSubmitting: true,
    submitLabel: "Saving…",
  },
};
