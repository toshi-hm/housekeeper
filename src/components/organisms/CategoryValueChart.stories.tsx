import type { Meta, StoryObj } from "@storybook/react";

import { CategoryValueChart } from "./CategoryValueChart";

const meta = {
  component: CategoryValueChart,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof CategoryValueChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { stats: [] },
};

export const WithData: Story = {
  args: {
    stats: [
      { categoryId: "c1", name: "食品", value: 4500 },
      { categoryId: "c2", name: "日用品", value: 2300 },
      { categoryId: "c3", name: "飲み物", value: 1200 },
      { categoryId: null, name: "__uncategorized__", value: 800 },
    ],
  },
};
