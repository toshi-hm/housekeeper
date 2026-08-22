import type { Meta, StoryObj } from "@storybook/react";

import { SecurityQuestionSettings } from "./SecurityQuestionSettings";

const meta = {
  component: SecurityQuestionSettings,
  tags: ["autodocs"],
} satisfies Meta<typeof SecurityQuestionSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

// Storybook環境ではsupabaseがモック化され未認証扱い（auth.getUser -> user: null）
// になるため、常に「未設定」状態で表示される。
export const Default: Story = {};
