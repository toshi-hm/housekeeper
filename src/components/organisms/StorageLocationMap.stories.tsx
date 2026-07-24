import type { Meta, StoryObj } from "@storybook/react";

import { StorageLocationMap } from "./StorageLocationMap";

const PHOTO_URL =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect width='400' height='300' fill='%23e5e7eb'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%239ca3af' font-size='20'%3EStorage photo%3C/text%3E%3C/svg%3E";

const meta = {
  component: StorageLocationMap,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof StorageLocationMap>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithPhotoAndPins: Story = {
  args: {
    photoUrl: PHOTO_URL,
    pinnedItems: [
      { id: "1", name: "牛乳", x: 0.2, y: 0.3 },
      { id: "2", name: "卵", x: 0.7, y: 0.5 },
    ],
    unpinnedItems: [{ id: "3", name: "醤油" }],
  },
};

export const NoPhoto: Story = {
  args: {
    photoUrl: null,
    unpinnedItems: [
      { id: "1", name: "牛乳" },
      { id: "2", name: "卵" },
    ],
  },
};

export const PhotoWithoutPins: Story = {
  args: {
    photoUrl: PHOTO_URL,
    pinnedItems: [],
    unpinnedItems: [],
  },
};
