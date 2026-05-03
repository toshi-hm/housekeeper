import type { Meta, StoryObj } from "@storybook/react";

import { CategoryChart } from "./CategoryChart";

const meta = {
  component: CategoryChart,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof CategoryChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { stats: [] },
};

export const WithData: Story = {
  args: {
    stats: [
      { categoryId: "c1", name: "食品", count: 12 },
      { categoryId: "c2", name: "日用品", count: 8 },
      { categoryId: "c3", name: "飲み物", count: 5 },
      { categoryId: null, name: "__uncategorized__", count: 3 },
    ],
  },
};
