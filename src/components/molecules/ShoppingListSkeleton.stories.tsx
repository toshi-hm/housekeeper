import type { Meta, StoryObj } from "@storybook/react";

import { ShoppingListSkeleton } from "./ShoppingListSkeleton";

const meta = {
  component: ShoppingListSkeleton,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ShoppingListSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { count: 5 } };
