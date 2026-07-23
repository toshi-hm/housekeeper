import type { Meta, StoryObj } from "@storybook/react";

import { ItemConsumptionMiniChart } from "./ItemConsumptionMiniChart";

const meta = {
  component: ItemConsumptionMiniChart,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ItemConsumptionMiniChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithData: Story = {
  args: {
    pace: {
      monthly: [
        { month: "2026/05", totals: [{ unit: "mL", total: 1200 }] },
        { month: "2026/06", totals: [{ unit: "mL", total: 900 }] },
        { month: "2026/07", totals: [{ unit: "mL", total: 1500 }] },
      ],
      averagePerMonth: 1200,
      unit: "mL",
      estimatedWeeksRemaining: 2.3,
    },
  },
};

export const LowStock: Story = {
  args: {
    pace: {
      monthly: [
        { month: "2026/05", totals: [{ unit: "個", total: 8 }] },
        { month: "2026/06", totals: [{ unit: "個", total: 6 }] },
        { month: "2026/07", totals: [{ unit: "個", total: 10 }] },
      ],
      averagePerMonth: 8,
      unit: "個",
      estimatedWeeksRemaining: 0,
    },
  },
};

export const InsufficientData: Story = {
  args: {
    pace: {
      monthly: [
        { month: "2026/05", totals: [] },
        { month: "2026/06", totals: [] },
        { month: "2026/07", totals: [] },
      ],
      averagePerMonth: 0,
      unit: null,
      estimatedWeeksRemaining: null,
    },
  },
};
