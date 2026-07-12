import type { Meta, StoryObj } from "@storybook/react";

import { ColorDot } from "./ColorDot";

const meta = {
  component: ColorDot,
  tags: ["autodocs"],
} satisfies Meta<typeof ColorDot>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { color: "#3b82f6" },
};

export const NoColor: Story = {
  args: { color: null },
};

export const CustomSize: Story = {
  args: { color: "#ef4444", className: "h-5 w-5" },
};
