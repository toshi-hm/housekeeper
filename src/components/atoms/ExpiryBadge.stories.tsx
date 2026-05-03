import type { Meta, StoryObj } from "@storybook/react";

import { ExpiryBadge } from "./ExpiryBadge";

const meta = {
  component: ExpiryBadge,
  tags: ["autodocs"],
} satisfies Meta<typeof ExpiryBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fresh: Story = {
  args: { expiryDate: "2099-12-31" },
};

export const ExpiringSoon: Story = {
  args: {
    expiryDate: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
    warningDays: 3,
  },
};

export const Expired: Story = {
  args: { expiryDate: "2020-01-01" },
};

export const NoExpiry: Story = {
  args: { expiryDate: null },
};
