import type { Meta, StoryObj } from "@storybook/react";

import { SpendingChart } from "./SpendingChart";

const meta = {
  component: SpendingChart,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof SpendingChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    data: [
      { month: "2025/11", total: 0 },
      { month: "2025/12", total: 0 },
      { month: "2026/01", total: 0 },
      { month: "2026/02", total: 0 },
      { month: "2026/03", total: 0 },
      { month: "2026/04", total: 0 },
    ],
  },
};

export const WithData: Story = {
  args: {
    data: [
      { month: "2025/11", total: 12000 },
      { month: "2025/12", total: 8500 },
      { month: "2026/01", total: 15200 },
      { month: "2026/02", total: 6300 },
      { month: "2026/03", total: 21000 },
      { month: "2026/04", total: 4500 },
    ],
  },
};
