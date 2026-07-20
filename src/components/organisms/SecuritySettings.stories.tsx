import type { Meta, StoryObj } from "@storybook/react";

import { SecuritySettings } from "./SecuritySettings";

const meta = {
  component: SecuritySettings,
  tags: ["autodocs"],
} satisfies Meta<typeof SecuritySettings>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
