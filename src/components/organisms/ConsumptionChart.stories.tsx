import type { Meta, StoryObj } from "@storybook/react";

import { ConsumptionChart } from "./ConsumptionChart";

const meta = {
  component: ConsumptionChart,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ConsumptionChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    data: [
      { month: "2025/11", totals: [] },
      { month: "2025/12", totals: [] },
      { month: "2026/01", totals: [] },
      { month: "2026/02", totals: [] },
      { month: "2026/03", totals: [] },
      { month: "2026/04", totals: [] },
    ],
  },
};

export const WithData: Story = {
  args: {
    data: [
      { month: "2025/11", totals: [{ unit: "mL", total: 1200 }] },
      { month: "2025/12", totals: [{ unit: "mL", total: 800 }] },
      { month: "2026/01", totals: [{ unit: "mL", total: 1500 }] },
      { month: "2026/02", totals: [{ unit: "mL", total: 600 }] },
      { month: "2026/03", totals: [{ unit: "mL", total: 2100 }] },
      { month: "2026/04", totals: [{ unit: "mL", total: 450 }] },
    ],
  },
};

export const MixedUnits: Story = {
  args: {
    data: [
      { month: "2025/11", totals: [{ unit: "mL", total: 1200 }] },
      {
        month: "2025/12",
        totals: [
          { unit: "mL", total: 800 },
          { unit: "g", total: 300 },
        ],
      },
      { month: "2026/01", totals: [{ unit: "g", total: 500 }] },
      {
        month: "2026/02",
        totals: [
          { unit: "mL", total: 600 },
          { unit: "個", total: 12 },
        ],
      },
      { month: "2026/03", totals: [{ unit: "個", total: 20 }] },
      {
        month: "2026/04",
        totals: [
          { unit: "mL", total: 450 },
          { unit: "g", total: 150 },
          { unit: "個", total: 4 },
        ],
      },
    ],
  },
};
