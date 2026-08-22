import type { Meta, StoryObj } from "@storybook/react";

import { ImageUploader } from "./ImageUploader";

const meta = {
  component: ImageUploader,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ImageUploader>;

export default meta;
type Story = StoryObj<typeof meta>;

// 外部URL(placehold.co)への依存はVRT(#807)のスクリーンショットをネットワーク疎通に
// 応じて不安定にするため、他のStory(StorageLocationMap/LocationPinPicker)と同じ
// data URIのプレースホルダーに統一する。
const PREVIEW_IMAGE_DATA_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23e2e8f0'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%2394a3b8' font-size='20'%3EImage%3C/text%3E%3C/svg%3E";

export const Empty: Story = {
  args: { onFile: () => {} },
};

export const WithPreview: Story = {
  args: {
    previewUrl: PREVIEW_IMAGE_DATA_URL,
    onFile: () => {},
    onDelete: () => {},
  },
};

export const Uploading: Story = {
  args: {
    previewUrl: PREVIEW_IMAGE_DATA_URL,
    isUploading: true,
    onFile: () => {},
  },
};
