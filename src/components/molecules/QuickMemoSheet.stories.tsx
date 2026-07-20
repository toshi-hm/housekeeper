import type { Meta, StoryObj } from "@storybook/react";
import { fn } from "storybook/test";

import { QuickMemoSheet } from "./QuickMemoSheet";

const meta = {
  component: QuickMemoSheet,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    onSave: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof QuickMemoSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    open: true,
    itemName: "牛乳",
    initialNotes: "",
  },
};

export const WithExistingMemo: Story = {
  args: {
    open: true,
    itemName: "シャンプー",
    initialNotes: "詰め替え用は洗面台下のストックにあり",
  },
};

export const Submitting: Story = {
  args: {
    open: true,
    itemName: "牛乳",
    initialNotes: "賞味期限は目安、開封後は早めに使い切る",
    isSubmitting: true,
  },
};

export const Closed: Story = {
  args: {
    open: false,
    itemName: "牛乳",
    initialNotes: "",
  },
};
