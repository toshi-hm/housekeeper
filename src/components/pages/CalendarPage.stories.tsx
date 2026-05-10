import type { Meta, StoryObj } from "@storybook/react";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import type { Category, Item } from "@/types/item";

import { CalendarPage } from "./CalendarPage";

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
    name: "牛乳 1L",
    barcode: null,
    category_id: "cat-1",
    storage_location_id: null,
    units: 1,
    content_amount: 1,
    content_unit: "個",
    opened_remaining: null,
    purchase_date: null,
    expiry_date: "2026-05-03",
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

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const meta = {
  component: CalendarPage,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-5xl p-4">
        <Story />
      </div>
    ),
  ],
  args: {
    categories,
    onCheck: async () => {},
  },
  render: (args) => wrapper({ children: <CalendarPage {...args} /> }),
} satisfies Meta<typeof CalendarPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    items,
    isLoading: false,
  },
};

export const Empty: Story = {
  args: {
    items: [],
    isLoading: false,
  },
};

export const Loading: Story = {
  args: {
    items: [],
    isLoading: true,
  },
};
