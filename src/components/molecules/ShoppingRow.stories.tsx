import type { Meta, StoryObj } from "@storybook/react";

import { ShoppingRow } from "./ShoppingRow";

const meta = {
  component: ShoppingRow,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ShoppingRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    id: "1",
    name: "オーガニックミルク",
    desiredUnits: 2,
    onPurchase: () => {},
    onDelete: () => {},
    onEdit: () => {},
  },
};

export const WithNote: Story = {
  args: {
    id: "2",
    name: "シャンプー",
    desiredUnits: 1,
    note: "無添加のもの",
    onPurchase: () => {},
    onDelete: () => {},
    onEdit: () => {},
  },
};

export const Purchased: Story = {
  args: {
    id: "3",
    name: "洗剤",
    desiredUnits: 3,
    isPurchased: true,
    onDelete: () => {},
  },
};

export const EditMode: Story = {
  args: {
    id: "4",
    name: "牛乳",
    desiredUnits: 2,
    note: "低脂肪",
    isEditing: true,
    onEditSave: () => {},
    onEditCancel: () => {},
  },
};

export const EditModeNoNote: Story = {
  args: {
    id: "5",
    name: "卵",
    desiredUnits: 1,
    isEditing: true,
    onEditSave: () => {},
    onEditCancel: () => {},
  },
};
