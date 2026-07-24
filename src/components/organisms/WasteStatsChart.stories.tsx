import type { Meta, StoryObj } from "@storybook/react";

import { WasteStatsChart } from "./WasteStatsChart";

const meta = {
  component: WasteStatsChart,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof WasteStatsChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    data: [
      { month: "2026/02", total: 0, byCategory: [] },
      { month: "2026/03", total: 0, byCategory: [] },
      { month: "2026/04", total: 0, byCategory: [] },
    ],
  },
};

export const WithData: Story = {
  args: {
    data: [
      {
        month: "2026/02",
        total: 3,
        byCategory: [
          { categoryId: "c1", name: "食品", count: 2 },
          { categoryId: null, name: "__uncategorized__", count: 1 },
        ],
      },
      {
        month: "2026/03",
        total: 1,
        byCategory: [{ categoryId: "c1", name: "食品", count: 1 }],
      },
      {
        month: "2026/04",
        total: 5,
        byCategory: [
          { categoryId: "c1", name: "食品", count: 3 },
          { categoryId: "c2", name: "飲み物", count: 2 },
        ],
      },
    ],
  },
};
