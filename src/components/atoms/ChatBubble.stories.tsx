import type { Meta, StoryObj } from "@storybook/react";

import { ChatBubble } from "./ChatBubble";

const meta = {
  component: ChatBubble,
  tags: ["autodocs"],
} satisfies Meta<typeof ChatBubble>;

export default meta;
type Story = StoryObj<typeof meta>;

export const User: Story = {
  args: { role: "user", text: "牛乳はある？" },
};

export const Assistant: Story = {
  args: { role: "assistant", text: "牛乳は冷蔵庫に2本（1000mL）あります。賞味期限は7月10日です。" },
};
