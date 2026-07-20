import type { Meta, StoryObj } from "@storybook/react";

import { DeletionReasonDialog } from "./DeletionReasonDialog";

const meta = {
  component: DeletionReasonDialog,
  tags: ["autodocs"],
} satisfies Meta<typeof DeletionReasonDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    open: true,
    title: "在庫を削除",
    message: "この在庫アイテムを削除しますか？消費履歴も削除されます。",
    confirmLabel: "削除",
    onConfirm: () => {},
    onCancel: () => {},
  },
};

export const Closed: Story = {
  args: {
    open: false,
    title: "在庫を削除",
    message: "この在庫アイテムを削除しますか？消費履歴も削除されます。",
    onConfirm: () => {},
    onCancel: () => {},
  },
};

export const IsConfirming: Story = {
  args: {
    open: true,
    title: "在庫を削除",
    message: "この在庫アイテムを削除しますか？消費履歴も削除されます。",
    confirmLabel: "削除",
    isConfirming: true,
    onConfirm: () => {},
    onCancel: () => {},
  },
};

export const BulkDelete: Story = {
  args: {
    open: true,
    title: "削除",
    message: "選択した5件を削除しますか？",
    confirmLabel: "削除",
    onConfirm: () => {},
    onCancel: () => {},
  },
};
