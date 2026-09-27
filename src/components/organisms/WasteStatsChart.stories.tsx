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
      { month: "2026/02", total: 0, estimatedValue: 0, byCategory: [] },
      { month: "2026/03", total: 0, estimatedValue: 0, byCategory: [] },
      { month: "2026/04", total: 0, estimatedValue: 0, byCategory: [] },
    ],
  },
};

export const WithData: Story = {
  args: {
    data: [
      {
        month: "2026/02",
        total: 3,
        estimatedValue: 1800,
        byCategory: [
          { categoryId: "c1", name: "食品", count: 2, value: 1200 },
          { categoryId: null, name: "__uncategorized__", count: 1, value: 600 },
        ],
      },
      {
        month: "2026/03",
        total: 1,
        estimatedValue: 500,
        byCategory: [{ categoryId: "c1", name: "食品", count: 1, value: 500 }],
      },
      {
        month: "2026/04",
        total: 5,
        estimatedValue: 3400,
        byCategory: [
          { categoryId: "c1", name: "食品", count: 3, value: 2100 },
          { categoryId: "c2", name: "飲み物", count: 2, value: 1300 },
        ],
      },
    ],
  },
};
