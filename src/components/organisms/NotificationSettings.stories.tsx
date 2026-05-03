import type { Meta, StoryObj } from "@storybook/react";

import { NotificationSettings } from "./NotificationSettings";

const meta = {
  component: NotificationSettings,
  tags: ["autodocs"],
} satisfies Meta<typeof NotificationSettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
