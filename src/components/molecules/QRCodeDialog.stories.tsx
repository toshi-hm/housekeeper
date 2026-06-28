import type { Meta, StoryObj } from "@storybook/react";

import { QRCodeDialog } from "./QRCodeDialog";

const meta = {
  component: QRCodeDialog,
  tags: ["autodocs"],
} satisfies Meta<typeof QRCodeDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    value: "https://example.com/items/abc-123",
    title: "牛乳",
    onClose: () => {},
  },
};
