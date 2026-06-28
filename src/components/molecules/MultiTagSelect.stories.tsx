import type { Meta, StoryObj } from "@storybook/react";

import type { Tag } from "@/types/item";

import { MultiTagSelect } from "./MultiTagSelect";

const tags: Tag[] = [
  { id: "1", user_id: "u", name: "オーガニック", color: "#22c55e", created_at: "" },
  { id: "2", user_id: "u", name: "冷凍可", color: "#3b82f6", created_at: "" },
  { id: "3", user_id: "u", name: "まとめ買い", color: "#f59e0b", created_at: "" },
];

const labels = {
  placeholder: "新しいタグ",
  addLabel: "追加",
  removeLabel: "削除",
  empty: "タグが選択されていません",
};

const meta = {
  component: MultiTagSelect,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  args: { tags, labels, onChange: () => {} },
} satisfies Meta<typeof MultiTagSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoneSelected: Story = {
  args: { selectedIds: [] },
};

export const SomeSelected: Story = {
  args: { selectedIds: ["1", "3"] },
};
