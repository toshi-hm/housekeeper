import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

import { ChatComposer } from "./ChatComposer";

const meta = {
  component: ChatComposer,
  tags: ["autodocs"],
  args: { onSend: fn() },
} satisfies Meta<typeof ChatComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Loading: Story = {
  args: { isLoading: true },
};
