import { fireEvent, render } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import type { Item } from "@/types/item";

import { ItemListRow } from "./ItemListRow";

const item: Item = {
  id: "item-1",
  user_id: "user-1",
  name: "Milk",
  units: 2,
  content_amount: 500,
  content_unit: "mL",
  opened_remaining: null,
  category_id: null,
  barcode: null,
  storage_location_id: null,
  expiry_date: null,
  purchase_date: null,
  notes: null,
  image_path: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const renderRow = (row: ReactNode) => render(<I18nextProvider i18n={i18n}>{row}</I18nextProvider>);

describe("ItemListRow", () => {
  test("renders the item name and remaining amount", () => {
    const { getByText } = renderRow(<ItemListRow item={item} selectionMode />);
    expect(getByText("Milk")).toBeDefined();
    expect(getByText("1000mL")).toBeDefined();
  });

  test("supports keyboard selection in selection mode", () => {
    const onToggleSelect = mock(() => {});
    const { getByRole } = renderRow(
      <ItemListRow item={item} selectionMode onToggleSelect={onToggleSelect} />,
    );

    fireEvent.keyDown(getByRole("checkbox", { name: "Milk" }), { key: " " });
    expect(onToggleSelect).toHaveBeenCalledWith(item);
  });
});
