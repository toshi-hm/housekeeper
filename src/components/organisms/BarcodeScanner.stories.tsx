import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

import { BarcodeScanner } from "./BarcodeScanner";

const meta = {
  component: BarcodeScanner,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    onScan: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof BarcodeScanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
