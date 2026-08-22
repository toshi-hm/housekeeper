import type { Meta, StoryObj } from "@storybook/react";

import { UsageCountBadge } from "./UsageCountBadge";

const meta = {
  component: UsageCountBadge,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof UsageCountBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const InUse: Story = {
  args: { count: 3 },
};

export const SingleItem: Story = {
  args: { count: 1 },
};

export const NotInUse: Story = {
  args: { count: 0 },
};
