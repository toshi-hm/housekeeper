import type { Meta, StoryObj } from "@storybook/react";

import { PurchaseHistoryRow } from "./PurchaseHistoryRow";

const meta = {
  component: PurchaseHistoryRow,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof PurchaseHistoryRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    id: "1",
    name: "牛乳",
    desiredUnits: 2,
    onRestock: () => {},
  },
};

export const WithNote: Story = {
  args: {
    id: "2",
    name: "シャンプー",
    desiredUnits: 1,
    note: "無添加のもの",
    onRestock: () => {},
  },
};

export const Restocking: Story = {
  args: {
    id: "3",
    name: "洗剤",
    desiredUnits: 1,
    onRestock: () => {},
    isRestocking: true,
  },
};

export const NoRestockAction: Story = {
  args: {
    id: "4",
    name: "卵",
    desiredUnits: 1,
  },
};
