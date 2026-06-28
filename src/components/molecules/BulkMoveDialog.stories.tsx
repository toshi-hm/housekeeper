import type { Meta, StoryObj } from "@storybook/react";

import { BulkMoveDialog } from "./BulkMoveDialog";

const meta = {
  component: BulkMoveDialog,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof BulkMoveDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ChangeLocation: Story = {
  args: {
    open: true,
    title: "保管場所を変更",
    noneLabel: "未設定",
    confirmLabel: "変更",
    cancelLabel: "キャンセル",
    options: [
      { id: "1", name: "冷蔵庫" },
      { id: "2", name: "パントリー" },
    ],
    onConfirm: () => {},
    onClose: () => {},
  },
};
