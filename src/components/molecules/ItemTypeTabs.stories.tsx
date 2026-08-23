import type { Meta, StoryObj } from "@storybook/react";

import { ItemTypeTabs } from "./ItemTypeTabs";

const meta = {
  component: ItemTypeTabs,
  tags: ["autodocs"],
} satisfies Meta<typeof ItemTypeTabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const All: Story = {
  args: {
    value: "all",
    counts: { all: 42, food: 30, daily_goods: 12 },
    onChange: () => {},
  },
};

export const Food: Story = {
  args: {
    value: "food",
    counts: { all: 42, food: 30, daily_goods: 12 },
    onChange: () => {},
  },
};

export const DailyGoodsEmpty: Story = {
  args: {
    value: "daily_goods",
    counts: { all: 30, food: 30, daily_goods: 0 },
    onChange: () => {},
  },
};
