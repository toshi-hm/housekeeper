import type { Meta, StoryObj } from "@storybook/react";

import { ShoppingGroupHeader } from "./ShoppingGroupHeader";

const meta = {
  component: ShoppingGroupHeader,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ShoppingGroupHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    name: "食品",
    color: "#22c55e",
    count: 3,
    otherLabel: "その他",
  },
};

export const NoColor: Story = {
  args: {
    name: "日用品",
    color: null,
    count: 1,
    otherLabel: "その他",
  },
};

export const Uncategorized: Story = {
  args: {
    name: null,
    count: 2,
    otherLabel: "その他",
  },
};
