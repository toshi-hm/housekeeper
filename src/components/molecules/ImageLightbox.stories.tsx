import type { Meta, StoryObj } from "@storybook/react";

import { ImageLightbox } from "./ImageLightbox";

const meta = {
  component: ImageLightbox,
  tags: ["autodocs"],
} satisfies Meta<typeof ImageLightbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  args: {
    open: true,
    imageUrl: "https://picsum.photos/seed/housekeeper/800/600",
    alt: "牛乳",
    onClose: () => {},
  },
};

export const Closed: Story = {
  args: {
    open: false,
    imageUrl: "https://picsum.photos/seed/housekeeper/800/600",
    alt: "牛乳",
    onClose: () => {},
  },
};

// 画像がない場合は何も表示されない（ガード）
export const NoImage: Story = {
  args: {
    open: true,
    imageUrl: null,
    alt: "牛乳",
    onClose: () => {},
  },
};
