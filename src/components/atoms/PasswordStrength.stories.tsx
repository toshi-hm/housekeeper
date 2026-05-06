import type { Meta, StoryObj } from "@storybook/react";

import { PasswordStrength } from "./PasswordStrength";

const meta = {
  component: PasswordStrength,
  tags: ["autodocs"],
} satisfies Meta<typeof PasswordStrength>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { password: "" },
};

export const TooShort: Story = {
  args: { password: "Ab1!" },
};

export const OnlyLowercase: Story = {
  args: { password: "abcdefgh" },
};

export const TwoTypes: Story = {
  args: { password: "abcdef12" },
};

export const ThreeTypes: Story = {
  args: { password: "Abcdef12" },
};

export const AllFourTypes: Story = {
  args: { password: "Abcdef1!" },
};
