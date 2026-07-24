import type { Meta, StoryObj } from "@storybook/react";

import { AlreadyInStockBanner } from "./AlreadyInStockBanner";

const meta = {
  component: AlreadyInStockBanner,
  tags: ["autodocs"],
  args: {
    onAddNewLot: () => {},
    onViewExisting: () => {},
  },
} satisfies Meta<typeof AlreadyInStockBanner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithLocationAndExpiry: Story = {
  args: {
    units: 2,
    locationName: "パントリー",
    expiryDate: "2026-09-01",
  },
};

export const NearExpiry: Story = {
  args: {
    units: 1,
    locationName: "冷蔵庫",
    expiryDate: "2026-07-26",
  },
};

export const AlreadyExpired: Story = {
  args: {
    units: 1,
    locationName: "冷蔵庫",
    expiryDate: "2026-07-10",
  },
};

export const NoLocation: Story = {
  args: {
    units: 3,
    locationName: null,
    expiryDate: null,
  },
};

export const NoExpiryDate: Story = {
  args: {
    units: 5,
    locationName: "キッチン棚",
    expiryDate: null,
  },
};
