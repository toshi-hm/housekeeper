import type { Meta, StoryObj } from "@storybook/react";

import { ExpiryTypeSelect } from "./ExpiryTypeSelect";

const meta = {
  component: ExpiryTypeSelect,
  tags: ["autodocs"],
} satisfies Meta<typeof ExpiryTypeSelect>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unset: Story = {
  args: {
    value: null,
    onChange: () => {},
  },
};

export const BestBefore: Story = {
  args: {
    value: "best_before",
    onChange: () => {},
  },
};

export const UseBy: Story = {
  args: {
    value: "use_by",
    onChange: () => {},
  },
};
