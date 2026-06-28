import type { Meta, StoryObj } from "@storybook/react";

import { BulkActionBar } from "./BulkActionBar";

const meta = {
  component: BulkActionBar,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof BulkActionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    selectedCount: 3,
    onChangeLocation: () => {},
    onChangeCategory: () => {},
    onConsume: () => {},
    onDelete: () => {},
  },
};

export const NoneSelected: Story = {
  args: {
    selectedCount: 0,
    onChangeLocation: () => {},
    onChangeCategory: () => {},
    onConsume: () => {},
    onDelete: () => {},
  },
};
