import type { Meta, StoryObj } from "@storybook/react";

import { ScanToShoppingDialog } from "./ScanToShoppingDialog";

const meta = {
  component: ScanToShoppingDialog,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ScanToShoppingDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LookingUp: Story = {
  args: {
    open: true,
    isLooking: true,
    defaultName: "",
    matchedExisting: false,
    onConfirm: () => {},
    onClose: () => {},
  },
};

export const MatchedExisting: Story = {
  args: {
    open: true,
    isLooking: false,
    defaultName: "牛乳",
    matchedExisting: true,
    onConfirm: () => {},
    onClose: () => {},
  },
};

export const NewProduct: Story = {
  args: {
    open: true,
    isLooking: false,
    defaultName: "オーガニックグリーンティー",
    matchedExisting: false,
    onConfirm: () => {},
    onClose: () => {},
  },
};

export const NotFound: Story = {
  args: {
    open: true,
    isLooking: false,
    defaultName: "",
    matchedExisting: false,
    onConfirm: () => {},
    onClose: () => {},
  },
};
