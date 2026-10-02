import type { Meta, StoryObj } from "@storybook/react";

import { NotificationFailureHistory } from "./NotificationFailureHistory";

const meta = {
  component: NotificationFailureHistory,
  tags: ["autodocs"],
} satisfies Meta<typeof NotificationFailureHistory>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { args: { failures: [] } };

export const RecentFailures: Story = {
  args: {
    failures: [
      {
        id: "failure-email",
        notification_type: "expiry",
        channel: "email",
        failure_code: "email_delivery_failed",
        failed_at: "2026-10-02T01:00:00.000Z",
      },
      {
        id: "failure-push",
        notification_type: "low_stock",
        channel: "push",
        failure_code: "push_no_subscriptions",
        failed_at: "2026-10-01T01:00:00.000Z",
      },
    ],
  },
};

export const Loading: Story = { args: { failures: [], isLoading: true } };

export const LoadError: Story = {
  args: { failures: [], hasError: true, onRetry: () => undefined },
};
