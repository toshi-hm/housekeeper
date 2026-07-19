import type { Meta, StoryObj } from "@storybook/react";

import { VoiceInputButton } from "./VoiceInputButton";

const meta = {
  component: VoiceInputButton,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Web Speech API が使える環境（Chrome / Safari 等）でのみ表示されるマイクボタン。" +
          "Firefox など非対応環境では何もレンダリングされない。",
      },
    },
  },
} satisfies Meta<typeof VoiceInputButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    onResult: () => {},
  },
};

export const WithCustomLabel: Story = {
  args: {
    onResult: () => {},
    label: "商品名を音声入力",
  },
};
