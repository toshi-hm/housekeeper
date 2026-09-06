import type { Meta, StoryObj } from "@storybook/react";

import { PriceIncreaseBadge } from "./PriceIncreaseBadge";

const meta = {
  component: PriceIncreaseBadge,
  tags: ["autodocs"],
} satisfies Meta<typeof PriceIncreaseBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Alerting: Story = {
  args: { alert: { baselinePrice: 200, currentPrice: 250, increasePercent: 25 } },
};

export const NoAlert: Story = {
  args: { alert: null },
};
