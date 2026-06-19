import type { Meta, StoryObj } from "@storybook/react";

import { ShareButton } from "./ShareButton";

const meta = {
  component: ShareButton,
  tags: ["autodocs"],
} satisfies Meta<typeof ShareButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "買い物リスト",
    text: "・牛乳\n・卵\n・パン",
    label: "共有",
  },
};

export const WithoutLabel: Story = {
  args: {
    title: "Shopping List",
    text: "- Milk\n- Eggs\n- Bread",
  },
};
