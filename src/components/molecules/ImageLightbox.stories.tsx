import type { Meta, StoryObj } from "@storybook/react";

import { ImageLightbox } from "./ImageLightbox";

const meta = {
  component: ImageLightbox,
  tags: ["autodocs"],
} satisfies Meta<typeof ImageLightbox>;

export default meta;
type Story = StoryObj<typeof meta>;

// 外部URL(picsum.photos)への依存はVRT(#807)のスクリーンショットをネットワーク疎通に
// 応じて不安定にするため、他のStory(StorageLocationMap/LocationPinPicker/ImageUploader)
// と同じdata URIのプレースホルダーに統一する。
const LIGHTBOX_IMAGE_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='600'%3E%3Crect width='800' height='600' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='32'%3EImage%3C/text%3E%3C/svg%3E";

export const Open: Story = {
  args: {
    open: true,
    imageUrl: LIGHTBOX_IMAGE_DATA_URL,
    alt: "牛乳",
    onClose: () => {},
  },
};

export const Closed: Story = {
  args: {
    open: false,
    imageUrl: LIGHTBOX_IMAGE_DATA_URL,
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
