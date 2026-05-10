import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";

import type { Category, Item } from "@/types/item";

import { ExpiryCalendar } from "./ExpiryCalendar";

const categories: Category[] = [
  {
    id: "cat-1",
    user_id: "user-1",
    name: "冷蔵",
    color: "#22c55e",
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
  },
];

const item: Item = {
  id: "item-1",
  user_id: "user-1",
  name: "ヨーグルト",
  barcode: null,
  category_id: "cat-1",
  storage_location_id: null,
  units: 1,
  content_amount: 1,
  content_unit: "個",
  opened_remaining: null,
  purchase_date: null,
  expiry_date: "2026-05-15",
  image_path: null,
  notes: null,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
  deleted_at: null,
};

const labels = {
  close: "閉じる",
  noItemsOnDate: "この日に期限を迎えるアイテムはありません",
  expiryItemsOnDate: (date: string) => `${date} の期限アイテム`,
};

describe("ExpiryCalendar", () => {
  it("opens date modal and shows items for selected day", () => {
    const { getByRole, getByText } = render(
      <ExpiryCalendar items={[item]} categories={categories} labels={labels} />,
    );

    fireEvent.click(getByRole("button", { name: "15" }));

    expect(getByText("2026-05-15 の期限アイテム")).toBeDefined();
    expect(getByText("ヨーグルト")).toBeDefined();
  });

  it("shows empty message when selected day has no items", () => {
    const { getByRole, getByText } = render(
      <ExpiryCalendar items={[]} categories={categories} labels={labels} />,
    );

    fireEvent.click(getByRole("button", { name: "1" }));

    expect(getByText("この日に期限を迎えるアイテムはありません")).toBeDefined();
  });
});
