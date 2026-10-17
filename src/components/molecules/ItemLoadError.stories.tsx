import type { Meta, StoryObj } from "@storybook/react";

import { ItemLoadError } from "./ItemLoadError";

const meta = {
  component: ItemLoadError,
  tags: ["autodocs"],
  args: {
    onRetry: () => {},
    onBack: () => {},
  },
} satisfies Meta<typeof ItemLoadError>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
