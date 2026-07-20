import type { Meta, StoryObj } from "@storybook/react";

import { ViewModeToggle } from "./ViewModeToggle";

const meta = {
  component: ViewModeToggle,
  tags: ["autodocs"],
} satisfies Meta<typeof ViewModeToggle>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {
  args: {
    value: "grid",
    onChange: () => {},
  },
};

export const List: Story = {
  args: {
    value: "list",
    onChange: () => {},
  },
};
