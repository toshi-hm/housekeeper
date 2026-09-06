import type { Meta, StoryObj } from "@storybook/react";

import { SimilarItemSuggestion } from "./SimilarItemSuggestion";

const meta = {
  component: SimilarItemSuggestion,
  tags: ["autodocs"],
  args: {
    onViewMatch: () => {},
  },
} satisfies Meta<typeof SimilarItemSuggestion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    matchName: "たまねぎ",
  },
};

export const LongName: Story = {
  args: {
    matchName: "北海道産こだわり有機栽培たまねぎ（3個ネット入り）",
  },
};
