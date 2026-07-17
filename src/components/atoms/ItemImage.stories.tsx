import type { Meta, StoryObj } from "@storybook/react";

import { ItemImage } from "./ItemImage";

const meta = {
  component: ItemImage,
  tags: ["autodocs"],
} satisfies Meta<typeof ItemImage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoImage: Story = {
  args: { imagePath: null, className: "h-40 w-full rounded-lg" },
};

export const WithPath: Story = {
  args: { imagePath: "user-id/item-id.jpg", alt: "Product", className: "h-40 w-full rounded-lg" },
};
