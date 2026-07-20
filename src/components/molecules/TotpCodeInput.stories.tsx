import type { Meta, StoryObj } from "@storybook/react";

import { TotpCodeInput } from "./TotpCodeInput";

const meta = {
  component: TotpCodeInput,
  tags: ["autodocs"],
} satisfies Meta<typeof TotpCodeInput>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: "",
    onChange: () => {},
  },
};

export const Filled: Story = {
  args: {
    value: "123456",
    onChange: () => {},
  },
};

export const Disabled: Story = {
  args: {
    value: "123456",
    onChange: () => {},
    disabled: true,
  },
};
