import type { Meta, StoryObj } from "@storybook/react";

import { TagBadge } from "./TagBadge";

const meta = {
  component: TagBadge,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof TagBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { name: "オーガニック", color: "#22c55e" },
};

export const NoColor: Story = {
  args: { name: "まとめ買い", color: null },
};

export const Removable: Story = {
  args: { name: "冷凍可", color: "#3b82f6", onRemove: () => {}, removeLabel: "削除" },
};
