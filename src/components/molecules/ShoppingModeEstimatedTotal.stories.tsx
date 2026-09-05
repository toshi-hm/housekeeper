import type { Meta, StoryObj } from "@storybook/react";

import { ShoppingModeEstimatedTotal } from "./ShoppingModeEstimatedTotal";

const meta = {
  component: ShoppingModeEstimatedTotal,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ShoppingModeEstimatedTotal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AllItemsMatched: Story = {
  args: {
    total: 348,
    hasExcludedItems: false,
  },
};

export const SomeItemsExcluded: Story = {
  args: {
    total: 198,
    hasExcludedItems: true,
  },
};
