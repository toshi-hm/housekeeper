import type { Meta, StoryObj } from "@storybook/react";

import { ConfirmDialog } from "./ConfirmDialog";

const meta = {
  component: ConfirmDialog,
  tags: ["autodocs"],
} satisfies Meta<typeof ConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    open: true,
    title: "削除の確認",
    message: "このアイテムを削除しますか？この操作は取り消せません。",
    confirmLabel: "削除",
    onConfirm: () => {},
    onCancel: () => {},
  },
};

export const Closed: Story = {
  args: {
    open: false,
    title: "削除の確認",
    message: "このアイテムを削除しますか？",
    onConfirm: () => {},
    onCancel: () => {},
  },
};
