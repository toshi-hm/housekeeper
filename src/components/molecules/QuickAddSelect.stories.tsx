import type { Meta, StoryObj } from "@storybook/react";
import { useState } from "react";

import { QuickAddSelect } from "./QuickAddSelect";

const meta = {
  component: QuickAddSelect,
  tags: ["autodocs"],
  args: {
    onAdd: async () => {},
    options: [],
    value: "",
    onChange: () => {},
  },
} satisfies Meta<typeof QuickAddSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

const ControlledWrapper = (args: React.ComponentProps<typeof QuickAddSelect>) => {
  const [value, setValue] = useState(args.value);
  return <QuickAddSelect {...args} value={value} onChange={setValue} />;
};

export const Default: Story = {
  render: (args) => <ControlledWrapper {...args} />,
  args: {
    placeholder: "カテゴリを選択",
    addLabel: "カテゴリを追加",
    options: [
      { value: "1", label: "食品" },
      { value: "2", label: "日用品" },
      { value: "3", label: "家電" },
    ],
  },
};

export const WithSelectedOption: Story = {
  render: (args) => <ControlledWrapper {...args} />,
  args: {
    value: "1",
    placeholder: "カテゴリを選択",
    addLabel: "カテゴリを追加",
    options: [
      { value: "1", label: "食品" },
      { value: "2", label: "日用品" },
      { value: "3", label: "家電" },
    ],
  },
};

export const WithDeleteButtons: Story = {
  render: (args) => <ControlledWrapper {...args} />,
  args: {
    placeholder: "カテゴリを選択",
    addLabel: "カテゴリを追加",
    options: [
      { value: "1", label: "食品" },
      { value: "2", label: "日用品" },
      { value: "3", label: "家電" },
    ],
    onDelete: async () => {},
  },
};

export const WithDeleteInUseError: Story = {
  render: (args) => <ControlledWrapper {...args} />,
  args: {
    placeholder: "カテゴリを選択",
    addLabel: "カテゴリを追加",
    options: [
      { value: "1", label: "食品" },
      { value: "2", label: "日用品" },
    ],
    onDelete: async (id) => {
      if (id === "1") throw new Error("このカテゴリは使用中のため削除できません");
    },
  },
};

export const EmptyList: Story = {
  render: (args) => <ControlledWrapper {...args} />,
  args: {
    placeholder: "保管場所を選択",
    addLabel: "保管場所を追加",
    options: [],
  },
};

export const StorageLocation: Story = {
  render: (args) => <ControlledWrapper {...args} />,
  args: {
    placeholder: "保管場所を選択",
    addLabel: "保管場所を追加",
    options: [
      { value: "1", label: "冷蔵庫" },
      { value: "2", label: "冷凍庫" },
      { value: "3", label: "パントリー" },
    ],
    onDelete: async () => {},
  },
};
