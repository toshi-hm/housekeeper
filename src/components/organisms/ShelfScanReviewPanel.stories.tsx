import type { Meta, StoryObj } from "@storybook/react";

import { withRouter } from "../../../.storybook/routerDecorator";
import { ShelfScanReviewPanel } from "./ShelfScanReviewPanel";

const meta = {
  component: ShelfScanReviewPanel,
  tags: ["autodocs"],
  decorators: [withRouter],
} satisfies Meta<typeof ShelfScanReviewPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithBothCandidates: Story = {
  args: {
    possiblyConsumed: [
      { id: "1", name: "牛乳" },
      { id: "2", name: "卵" },
    ],
    possiblyUnregistered: ["醤油", "冷凍餃子"],
  },
};

export const OnlyPossiblyConsumed: Story = {
  args: {
    possiblyConsumed: [{ id: "1", name: "にんじん" }],
    possiblyUnregistered: [],
  },
};

export const OnlyPossiblyUnregistered: Story = {
  args: {
    possiblyConsumed: [],
    possiblyUnregistered: ["醤油"],
  },
};

export const Empty: Story = {
  args: {
    possiblyConsumed: [],
    possiblyUnregistered: [],
  },
};
