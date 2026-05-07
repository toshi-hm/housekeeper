import type { Meta, StoryObj } from "@storybook/react";

import { QuickAddSelect } from "./QuickAddSelect";

const meta = {
  component: QuickAddSelect,
  tags: ["autodocs"],
  args: {
    onAdd: async () => {},
  },
} satisfies Meta<typeof QuickAddSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: "",
    addLabel: "カテゴリを追加",
    children: (
      <>
        <option value="">カテゴリを選択</option>
        <option value="1">食品</option>
        <option value="2">日用品</option>
        <option value="3">家電</option>
      </>
    ),
  },
};

export const WithSelectedOption: Story = {
  args: {
    value: "1",
    addLabel: "カテゴリを追加",
    children: (
      <>
        <option value="">カテゴリを選択</option>
        <option value="1">食品</option>
        <option value="2">日用品</option>
        <option value="3">家電</option>
      </>
    ),
  },
};

export const EmptyList: Story = {
  args: {
    value: "",
    addLabel: "保管場所を追加",
    children: <option value="">保管場所を選択</option>,
  },
};

export const StorageLocation: Story = {
  args: {
    value: "",
    addLabel: "保管場所を追加",
    children: (
      <>
        <option value="">保管場所を選択</option>
        <option value="1">冷蔵庫</option>
        <option value="2">冷凍庫</option>
        <option value="3">パントリー</option>
      </>
    ),
  },
};
