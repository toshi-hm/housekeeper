import type { Meta, StoryObj } from "@storybook/react";

import { MealPlanStockWarning } from "./MealPlanStockWarning";

const meta = {
  component: MealPlanStockWarning,
  tags: ["autodocs"],
  args: {
    onAddMissingToShoppingList: () => {},
  },
} satisfies Meta<typeof MealPlanStockWarning>;

export default meta;
type Story = StoryObj<typeof meta>;

export const StockOk: Story = {
  args: { shortages: [] },
};

export const Shortage: Story = {
  args: {
    shortages: [
      { item_id: "1", item_name: "卵", required: 3, available: 1, unit: "個" },
      { item_id: "2", item_name: "牛乳", required: 200, available: 0, unit: "ml" },
    ],
  },
};

export const Adding: Story = {
  args: {
    shortages: [{ item_id: "1", item_name: "卵", required: 3, available: 1, unit: "個" }],
    isAdding: true,
  },
};
