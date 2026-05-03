import type { Meta, StoryObj } from "@storybook/react";

import { ExpiryChart } from "./ExpiryChart";

const meta = {
  component: ExpiryChart,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ExpiryChart>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { distribution: [] },
};

export const WithData: Story = {
  args: {
    distribution: [
      { status: "expired", count: 2 },
      { status: "expiring-soon", count: 5 },
      { status: "ok", count: 18 },
      { status: "unknown", count: 3 },
    ],
  },
};

export const AllExpired: Story = {
  args: {
    distribution: [{ status: "expired", count: 7 }],
  },
};
