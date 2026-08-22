import type { Meta, StoryObj } from "@storybook/react";

import type { Category, Item } from "@/types/item";

import { ExpiryCalendar } from "./ExpiryCalendar";

const categories: Category[] = [
  {
    id: "cat-1",
    user_id: "user-1",
    name: "乳製品",
    color: "#22c55e",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
  },
  {
    id: "cat-2",
    user_id: "user-1",
    name: "飲料",
    color: "#3b82f6",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
  },
];

const items: Item[] = [
  {
    id: "item-1",
    user_id: "user-1",
    name: "牛乳",
    barcode: null,
    category_id: "cat-1",
    storage_location_id: null,
    units: 1,
    content_amount: 1,
    content_unit: "個",
    opened_remaining: null,
    purchase_date: null,
    expiry_date: "2026-05-12",
    image_path: null,
    notes: null,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    deleted_at: null,
  },
  {
    id: "item-2",
    user_id: "user-1",
    name: "豆乳",
    barcode: null,
    category_id: "cat-2",
    storage_location_id: null,
    units: 1,
    content_amount: 1,
    content_unit: "個",
    opened_remaining: null,
    purchase_date: null,
    expiry_date: "2026-05-12",
    image_path: null,
    notes: null,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    deleted_at: null,
  },
];

const meta = {
  component: ExpiryCalendar,
  tags: ["autodocs"],
  // ExpiryCalendar は内部で `new Date()` から表示月と「今日」のハイライトを
  // 算出するため、baseline撮影日以外にCIが走ると月替わり・日替わりで
  // 必ず画素差分が出てVRTが赤くなる。日付を固定するstory引数が無い以上、
  // 現状はVRT対象から除外する。
  parameters: { vrt: { disable: true } },
  args: {
    categories,
    labels: {
      close: "閉じる",
      noItemsOnDate: "この日に期限を迎えるアイテムはありません",
      expiryItemsOnDate: (date: string) => `${date} の期限アイテム`,
      legendExpired: "期限切れ",
      legendSoon: "期限間近",
      legendOk: "期限内",
    },
  },
} satisfies Meta<typeof ExpiryCalendar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items,
  },
};

export const Empty: Story = {
  args: {
    items: [],
  },
};
