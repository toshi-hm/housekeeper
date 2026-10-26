import type { Meta, StoryObj } from "@storybook/react";
import { Minus, NotebookPen } from "lucide-react";

import { SwipeableRow } from "./SwipeableRow";

const meta = {
  component: SwipeableRow,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "行を横にスワイプしてアクションを実行する。タッチ操作の近道で、同じ操作を行内のボタンでも行えることを前提とする。",
      },
    },
  },
} satisfies Meta<typeof SwipeableRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const Row = () => <div className="rounded-lg border p-3 text-sm">牛乳 ×2（左右にスワイプ）</div>;

export const BothDirections: Story = {
  args: {
    leftAction: {
      label: "1個消費",
      icon: <Minus className="h-4 w-4" aria-hidden="true" />,
      className: "bg-primary",
      onTrigger: () => {},
    },
    rightAction: {
      label: "メモを編集",
      icon: <NotebookPen className="h-4 w-4" aria-hidden="true" />,
      className: "bg-sky-600",
      onTrigger: () => {},
    },
    children: <Row />,
  },
};

export const LeftOnly: Story = {
  args: {
    leftAction: { label: "削除", className: "bg-destructive", onTrigger: () => {} },
    children: <Row />,
  },
};

export const Disabled: Story = {
  args: { ...BothDirections.args, disabled: true },
};
