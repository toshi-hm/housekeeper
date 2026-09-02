import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { type ShoppingModeAlertEntry, ShoppingModeView } from "./ShoppingModeView";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const plannedItem = {
  id: "s1",
  user_id: "u1",
  name: "牛乳",
  desired_units: 1,
  note: null,
  linked_item_id: null,
  auto_added: false,
  status: "planned" as const,
  purchased_at: null,
  created_item_id: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const lowStockEntry: ShoppingModeAlertEntry = { id: "i1", name: "醤油", detail: "在庫 1 / 最低 3" };
const expiringEntry: ShoppingModeAlertEntry = {
  id: "i2",
  name: "ヨーグルト",
  detail: "2026/09/05",
};

describe("ShoppingModeView", () => {
  it("shows the all-clear message when every section is empty", () => {
    const { container, queryByText } = render(
      <ShoppingModeView
        plannedItems={[]}
        onPurchase={() => {}}
        onDelete={() => {}}
        lowStockItems={[]}
        expiringItems={[]}
        addedItemIds={new Set()}
        onAddAlert={() => {}}
      />,
      { wrapper },
    );
    expect(container.textContent).not.toBe("");
    expect(queryByText("牛乳")).toBeNull();
  });

  it("renders planned shopping items", () => {
    const { getByText } = render(
      <ShoppingModeView
        plannedItems={[plannedItem]}
        onPurchase={() => {}}
        onDelete={() => {}}
        lowStockItems={[]}
        expiringItems={[]}
        addedItemIds={new Set()}
        onAddAlert={() => {}}
      />,
      { wrapper },
    );
    expect(getByText("牛乳")).toBeTruthy();
  });

  it("calls onPurchase with the shopping item id", () => {
    const onPurchase = mock(() => {});
    const { container } = render(
      <ShoppingModeView
        plannedItems={[plannedItem]}
        onPurchase={onPurchase}
        onDelete={() => {}}
        lowStockItems={[]}
        expiringItems={[]}
        addedItemIds={new Set()}
        onAddAlert={() => {}}
      />,
      { wrapper },
    );
    // ShoppingRow's purchase button is the only button without an aria-label
    const btn = container.querySelector("button:not([aria-label])") as HTMLElement;
    fireEvent.click(btn);
    expect(onPurchase).toHaveBeenCalledWith("s1");
  });

  it("renders low-stock and expiring entries", () => {
    const { getByText } = render(
      <ShoppingModeView
        plannedItems={[]}
        onPurchase={() => {}}
        onDelete={() => {}}
        lowStockItems={[lowStockEntry]}
        expiringItems={[expiringEntry]}
        addedItemIds={new Set()}
        onAddAlert={() => {}}
      />,
      { wrapper },
    );
    expect(getByText("醤油")).toBeTruthy();
    expect(getByText("ヨーグルト")).toBeTruthy();
  });

  it("calls onAddAlert with the entry when its add button is clicked", () => {
    const onAddAlert = mock(() => {});
    const { getByRole } = render(
      <ShoppingModeView
        plannedItems={[]}
        onPurchase={() => {}}
        onDelete={() => {}}
        lowStockItems={[lowStockEntry]}
        expiringItems={[]}
        addedItemIds={new Set()}
        onAddAlert={onAddAlert}
      />,
      { wrapper },
    );
    fireEvent.click(getByRole("button"));
    expect(onAddAlert).toHaveBeenCalledWith(lowStockEntry);
  });

  it("marks an alert entry as added when its id is in addedItemIds", () => {
    const { getByRole } = render(
      <ShoppingModeView
        plannedItems={[]}
        onPurchase={() => {}}
        onDelete={() => {}}
        lowStockItems={[lowStockEntry]}
        expiringItems={[]}
        addedItemIds={new Set(["i1"])}
        onAddAlert={() => {}}
      />,
      { wrapper },
    );
    expect((getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
