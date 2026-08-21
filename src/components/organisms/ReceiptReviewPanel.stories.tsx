import type { Meta, StoryObj } from "@storybook/react";

import { ReceiptReviewPanel } from "./ReceiptReviewPanel";

const meta = {
  component: ReceiptReviewPanel,
  tags: ["autodocs"],
  args: {
    storeName: null,
    onDraftsChange: () => {},
    onStoreNameChange: () => {},
    onDone: () => {},
  },
} satisfies Meta<typeof ReceiptReviewPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

// カテゴリ/保管場所の取得（useCategories/useStorageLocations）はSupabaseへの
// 実通信を伴うため、Storybookではエラー/空状態のセレクト肢になる想定
// （`WeeklyMealPlanner.stories.tsx` と同じ方針）。

export const WithDrafts: Story = {
  args: {
    drafts: [
      {
        id: "d1",
        name: "牛乳",
        quantity: 1,
        unitPrice: 248,
        confidence: "high",
        categoryId: null,
        storageLocationId: null,
        expiryDate: null,
        included: true,
      },
      {
        id: "d2",
        name: "にんじん?",
        quantity: 3,
        unitPrice: null,
        confidence: "low",
        categoryId: null,
        storageLocationId: null,
        expiryDate: null,
        included: true,
      },
    ],
  },
};

export const WithStoreName: Story = {
  args: {
    storeName: "○○スーパー",
    drafts: [
      {
        id: "d1",
        name: "牛乳",
        quantity: 1,
        unitPrice: 248,
        confidence: "high",
        categoryId: null,
        storageLocationId: null,
        expiryDate: null,
        included: true,
      },
    ],
  },
};

export const Empty: Story = {
  args: { drafts: [] },
};
