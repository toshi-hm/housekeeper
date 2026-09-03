import type { Meta, StoryObj } from "@storybook/react";

import { Badge } from "@/components/ui/badge";
import type { ShoppingItem } from "@/types/shopping";

import { ShoppingModeView } from "./ShoppingModeView";

const meta = {
  component: ShoppingModeView,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
} satisfies Meta<typeof ShoppingModeView>;

export default meta;
type Story = StoryObj<typeof meta>;

const plannedItems: ShoppingItem[] = [
  {
    id: "s1",
    user_id: "u1",
    name: "牛乳",
    desired_units: 1,
    note: null,
    linked_item_id: null,
    auto_added: false,
    status: "planned",
    purchased_at: null,
    created_item_id: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  },
  {
    id: "s2",
    user_id: "u1",
    name: "卵",
    desired_units: 1,
    note: "Mサイズ",
    linked_item_id: null,
    auto_added: false,
    status: "planned",
    purchased_at: null,
    created_item_id: null,
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
  },
];

export const Default: Story = {
  args: {
    plannedItems,
    onPurchase: () => {},
    onDelete: () => {},
    lowStockItems: [{ id: "i1", name: "醤油", detail: "在庫 1 / 最低 3" }],
    expiringItems: [
      {
        id: "i2",
        name: "ヨーグルト",
        detail: "2026/09/05",
        badge: <Badge variant="warning">期限間近</Badge>,
      },
    ],
    addedItemIds: new Set(),
    onAddAlert: () => {},
  },
};

export const ShoppingListOnly: Story = {
  args: {
    plannedItems,
    onPurchase: () => {},
    onDelete: () => {},
    lowStockItems: [],
    expiringItems: [],
    addedItemIds: new Set(),
    onAddAlert: () => {},
  },
};

export const AlertsOnly: Story = {
  args: {
    plannedItems: [],
    onPurchase: () => {},
    onDelete: () => {},
    lowStockItems: [{ id: "i1", name: "醤油", detail: "在庫 1 / 最低 3" }],
    expiringItems: [
      {
        id: "i2",
        name: "ヨーグルト",
        detail: "2026/09/05",
        badge: <Badge variant="warning">期限間近</Badge>,
      },
    ],
    addedItemIds: new Set(),
    onAddAlert: () => {},
  },
};

export const AlertAlreadyAdded: Story = {
  args: {
    plannedItems: [],
    onPurchase: () => {},
    onDelete: () => {},
    lowStockItems: [{ id: "i1", name: "醤油", detail: "在庫 1 / 最低 3" }],
    expiringItems: [],
    addedItemIds: new Set(["i1"]),
    onAddAlert: () => {},
  },
};

export const AllClear: Story = {
  args: {
    plannedItems: [],
    onPurchase: () => {},
    onDelete: () => {},
    lowStockItems: [],
    expiringItems: [],
    addedItemIds: new Set(),
    onAddAlert: () => {},
  },
};

/** #977: 元データ取得中は「確認事項なし」ではなくスケルトンを表示する。
 *  Skeleton は animate-pulse で不透明度が常に変化するため、撮影タイミングに
 *  よってVRTが不安定になる。VRT対象から除外する。 */
export const Loading: Story = {
  parameters: { vrt: { disable: true } },
  args: {
    plannedItems: [],
    onPurchase: () => {},
    onDelete: () => {},
    lowStockItems: [],
    expiringItems: [],
    addedItemIds: new Set(),
    onAddAlert: () => {},
    isLoading: true,
  },
};

/** #979: 買い物リストの行にも通常表示と同じ最安店舗ヒントを表示できる。 */
export const WithCheapestStoreHint: Story = {
  args: {
    plannedItems,
    onPurchase: () => {},
    onDelete: () => {},
    lowStockItems: [],
    expiringItems: [],
    addedItemIds: new Set(),
    onAddAlert: () => {},
    resolveCheapestStore: (item) =>
      item.id === "s1" ? { storeName: "〇〇スーパー", unitPrice: 198 } : null,
  },
};
