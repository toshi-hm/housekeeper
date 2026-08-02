import type { Meta, StoryObj } from "@storybook/react";

import { StorePriceComparisonCard } from "./StorePriceComparisonCard";

const meta = {
  component: StorePriceComparisonCard,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof StorePriceComparisonCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { comparisons: [] },
};

export const WithData: Story = {
  args: {
    comparisons: [
      {
        itemId: "item-1",
        itemName: "牛乳",
        stores: [
          { storeName: "○○スーパー", unitPrice: 198, purchaseDate: "2026-07-20" },
          { storeName: "△△マート", unitPrice: 228, purchaseDate: "2026-07-05" },
        ],
      },
      {
        itemId: "item-2",
        itemName: "卵",
        stores: [
          { storeName: "○○スーパー", unitPrice: 258, purchaseDate: "2026-07-18" },
          { storeName: "△△マート", unitPrice: 268, purchaseDate: "2026-07-10" },
          { storeName: "コンビニ", unitPrice: 328, purchaseDate: "2026-06-30" },
        ],
      },
    ],
  },
};
