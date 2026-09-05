import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

import { QuickConsumeSheet } from "./QuickConsumeSheet";

const meta = {
  component: QuickConsumeSheet,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    onConsumeOne: fn(),
    onConsumePartial: fn(),
    onAddNewItem: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof QuickConsumeSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Sealed: Story = {
  args: {
    open: true,
    itemName: "牛乳",
    units: 2,
    contentAmount: 1000,
    contentUnit: "mL",
    openedRemaining: null,
  },
};

export const OpenedPartial: Story = {
  args: {
    open: true,
    itemName: "シャンプー",
    units: 2,
    contentAmount: 400,
    contentUnit: "mL",
    openedRemaining: 120,
  },
};

export const Consuming: Story = {
  args: {
    open: true,
    itemName: "牛乳",
    units: 1,
    contentAmount: 1000,
    contentUnit: "mL",
    openedRemaining: null,
    isConsuming: true,
  },
};

export const Closed: Story = {
  args: {
    open: false,
    itemName: "牛乳",
    units: 1,
    contentAmount: 1000,
    contentUnit: "mL",
    openedRemaining: null,
  },
};
