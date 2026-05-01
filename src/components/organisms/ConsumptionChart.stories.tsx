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
      { month: "2025/11", total: 0, unit: "" },
      { month: "2025/12", total: 0, unit: "" },
      { month: "2026/01", total: 0, unit: "" },
      { month: "2026/02", total: 0, unit: "" },
      { month: "2026/03", total: 0, unit: "" },
      { month: "2026/04", total: 0, unit: "" },
    ],
  },
};

export const WithData: Story = {
  args: {
    data: [
      { month: "2025/11", total: 1200, unit: "mL" },
      { month: "2025/12", total: 800, unit: "mL" },
      { month: "2026/01", total: 1500, unit: "mL" },
      { month: "2026/02", total: 600, unit: "mL" },
      { month: "2026/03", total: 2100, unit: "mL" },
      { month: "2026/04", total: 450, unit: "mL" },
    ],
  },
};
