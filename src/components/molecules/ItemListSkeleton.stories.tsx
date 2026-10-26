import type { Meta, StoryObj } from "@storybook/react";

import { ItemListSkeleton } from "./ItemListSkeleton";

const meta = {
  component: ItemListSkeleton,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ItemListSkeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = { args: { variant: "grid", count: 4 } };

export const List: Story = { args: { variant: "list", count: 6 } };
