import type { Meta, StoryObj } from "@storybook/react";

import { WasteStreakBadge } from "./WasteStreakBadge";

const meta = {
  component: WasteStreakBadge,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof WasteStreakBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoStreak: Story = {
  args: { currentStreakWeeks: 0 },
};

export const SingleWeek: Story = {
  args: { currentStreakWeeks: 1 },
};

export const ThreeWeekStreak: Story = {
  args: { currentStreakWeeks: 3 },
};
