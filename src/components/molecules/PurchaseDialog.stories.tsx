import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

import { PurchaseDialog } from "./PurchaseDialog";

const meta = {
  component: PurchaseDialog,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    onSubmit: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof PurchaseDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: { open: true },
};

export const WithItemName: Story = {
  args: {
    open: true,
    itemName: "有機牛乳",
  },
};

export const Submitting: Story = {
  args: {
    open: true,
    itemName: "シャンプー",
    isSubmitting: true,
  },
};

export const Closed: Story = {
  args: { open: false },
};
