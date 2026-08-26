import type { Meta, StoryObj } from "@storybook/react";

import { ItemTypeSelect } from "./ItemTypeSelect";

const meta = {
  component: ItemTypeSelect,
  tags: ["autodocs"],
} satisfies Meta<typeof ItemTypeSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Food: Story = {
  args: {
    value: "food",
    onChange: () => {},
  },
};

export const DailyGoods: Story = {
  args: {
    value: "daily_goods",
    onChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    value: "food",
    disabled: true,
    onChange: () => {},
  },
};
