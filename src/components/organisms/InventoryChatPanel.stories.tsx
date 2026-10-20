import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

import { InventoryChatPanel } from "./InventoryChatPanel";

const meta = {
  component: InventoryChatPanel,
  parameters: { layout: "fullscreen" },
  args: { open: true, onClose: fn() },
} satisfies Meta<typeof InventoryChatPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Closed: Story = {
  args: { open: false },
};
