import type { Meta, StoryObj } from "@storybook/react";

import { OpenedAlertBadge } from "./OpenedAlertBadge";

const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString();

const meta = {
  component: OpenedAlertBadge,
  tags: ["autodocs"],
} satisfies Meta<typeof OpenedAlertBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Due: Story = {
  args: { openedAt: daysAgo(10), thresholdDays: 7 },
};

export const NotYetDue: Story = {
  args: { openedAt: daysAgo(2), thresholdDays: 7 },
};

export const NotOpened: Story = {
  args: { openedAt: null, thresholdDays: 7 },
};

export const NoThresholdSet: Story = {
  args: { openedAt: daysAgo(30), thresholdDays: null },
};
