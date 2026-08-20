import type { Meta, StoryObj } from "@storybook/react";

import { withRouter } from "../../../.storybook/routerDecorator";
import { SecurityQuestionReminderBanner } from "./SecurityQuestionReminderBanner";

const meta = {
  component: SecurityQuestionReminderBanner,
  tags: ["autodocs"],
  decorators: [withRouter],
  parameters: { layout: "padded" },
} satisfies Meta<typeof SecurityQuestionReminderBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

// Storybook環境ではsupabaseがモック化され未認証扱い（auth.getUser -> user: null）
// になり、useSecurityQuestionStatusはhasSecurityQuestion: falseを返すため
// バナーが表示される。
export const Default: Story = {};
