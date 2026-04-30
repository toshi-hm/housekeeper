import type { Meta, StoryObj } from "@storybook/react";

import { ImageUploader } from "./ImageUploader";

const meta = {
  component: ImageUploader,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ImageUploader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { onFile: () => {} },
};

export const WithPreview: Story = {
  args: {
    previewUrl: "https://placehold.co/400x300/e2e8f0/94a3b8?text=Image",
    onFile: () => {},
    onDelete: () => {},
  },
};

export const Uploading: Story = {
  args: {
    previewUrl: "https://placehold.co/400x300/e2e8f0/94a3b8?text=Image",
    isUploading: true,
    onFile: () => {},
  },
};
