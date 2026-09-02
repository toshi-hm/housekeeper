import type { Meta, StoryObj } from "@storybook/react";

import { Badge } from "@/components/ui/badge";

import { ShoppingModeAlertRow } from "./ShoppingModeAlertRow";

const meta = {
  component: ShoppingModeAlertRow,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ShoppingModeAlertRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LowStock: Story = {
  args: {
    name: "醤油",
    detail: "在庫 1 / 最低 3",
    onAdd: () => {},
  },
};

export const ExpiringSoonWithBadge: Story = {
  args: {
    name: "牛乳",
    detail: "2026/09/05",
    badge: <Badge variant="warning">期限間近</Badge>,
    onAdd: () => {},
  },
};

export const Added: Story = {
  args: {
    name: "醤油",
    detail: "在庫 1 / 最低 3",
    onAdd: () => {},
    isAdded: true,
  },
};

export const Pending: Story = {
  args: {
    name: "醤油",
    detail: "在庫 1 / 最低 3",
    onAdd: () => {},
    isPending: true,
  },
};

export const NoAction: Story = {
  args: {
    name: "醤油",
    detail: "在庫 1 / 最低 3",
  },
};
