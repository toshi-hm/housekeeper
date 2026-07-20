import type { Meta, StoryObj } from "@storybook/react";

import { ConsumptionSpeedRanking } from "./ConsumptionSpeedRanking";

const meta = {
  component: ConsumptionSpeedRanking,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ConsumptionSpeedRanking>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { ranking: [] },
};

export const WithData: Story = {
  args: {
    ranking: [
      { itemId: "1", name: "牛乳", dailyRate: 500, unit: "mL", logCount: 8, trend: "accelerating" },
      {
        itemId: "2",
        name: "食パン",
        dailyRate: 0.3,
        unit: "枚",
        logCount: 6,
        trend: "decelerating",
      },
      { itemId: "3", name: "卵", dailyRate: 0.2, unit: "個", logCount: 5, trend: "steady" },
      {
        itemId: "4",
        name: "ヨーグルト",
        dailyRate: 10,
        unit: "g",
        logCount: 1,
        trend: "insufficient-data",
      },
    ],
  },
};
