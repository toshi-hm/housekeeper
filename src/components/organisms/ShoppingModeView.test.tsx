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

  // #977: while the underlying data (shopping list / inventory / categories) is still
  // loading, every section prop still defaults to [] — without an explicit isLoading
  // flag this used to be indistinguishable from "genuinely nothing to check".
  it("shows a loading skeleton instead of the all-clear message while isLoading is true", () => {
    const { queryByText } = render(
      <ShoppingModeView
        plannedItems={[]}
        onPurchase={() => {}}
        onDelete={() => {}}
        lowStockItems={[]}
        expiringItems={[]}
        addedItemIds={new Set()}
        onAddAlert={() => {}}
        isLoading
      />,
      { wrapper },
    );
    expect(queryByText("shoppingModeAllClear", { exact: false })).toBeNull();
  });

  it("does not show the loading skeleton once isLoading is false, even with empty sections", () => {
    const { getByText } = render(
      <ShoppingModeView
        plannedItems={[]}
        onPurchase={() => {}}
        onDelete={() => {}}
        lowStockItems={[]}
        expiringItems={[]}
        addedItemIds={new Set()}
        onAddAlert={() => {}}
        isLoading={false}
      />,
      { wrapper },
    );
    expect(getByText(i18n.t("shopping:shoppingModeAllClear"))).toBeTruthy();
  });

  // #983: the lightweight "added to cart" check-off checkbox only appears when
  // onToggleCartCheck is provided (device-local, shopping-mode-only feature).
  it("does not show a cart-check checkbox or hint when onToggleCartCheck is not provided", () => {
    const { container, queryByText } = render(
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
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(queryByText(i18n.t("shopping:cartCheckOffHint"))).toBeNull();
  });

  it("shows a cart-check checkbox and hint for each planned item when onToggleCartCheck is provided", () => {
    const { container, getByText } = render(
      <ShoppingModeView
        plannedItems={[plannedItem]}
        onPurchase={() => {}}
        onDelete={() => {}}
        lowStockItems={[]}
        expiringItems={[]}
        addedItemIds={new Set()}
        onAddAlert={() => {}}
        checkedCartItemIds={new Set()}
        onToggleCartCheck={() => {}}
      />,
      { wrapper },
    );
    expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
    expect(getByText(i18n.t("shopping:cartCheckOffHint"))).toBeTruthy();
  });

  it("calls onToggleCartCheck with the shopping item id when its checkbox is toggled", () => {
    const onToggleCartCheck = mock(() => {});
    const { container } = render(
      <ShoppingModeView
        plannedItems={[plannedItem]}
        onPurchase={() => {}}
        onDelete={() => {}}
        lowStockItems={[]}
        expiringItems={[]}
        addedItemIds={new Set()}
        onAddAlert={() => {}}
        checkedCartItemIds={new Set()}
        onToggleCartCheck={onToggleCartCheck}
      />,
      { wrapper },
    );
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLElement;
    fireEvent.click(checkbox);
    expect(onToggleCartCheck).toHaveBeenCalledWith("s1");
  });

  it("shows a planned item's checkbox as checked when its id is in checkedCartItemIds", () => {
    const { container } = render(
      <ShoppingModeView
        plannedItems={[plannedItem]}
        onPurchase={() => {}}
        onDelete={() => {}}
        lowStockItems={[]}
        expiringItems={[]}
        addedItemIds={new Set()}
        onAddAlert={() => {}}
        checkedCartItemIds={new Set(["s1"])}
        onToggleCartCheck={() => {}}
      />,
      { wrapper },
    );
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  // #979: the shopping-list section must be able to show the same cheapest-store hint
  // as the normal (non-mode) list, via the resolveCheapestStore resolver prop.
  it("shows the cheapest-store hint for a planned item when resolveCheapestStore returns one", () => {
    const { getByText } = render(
      <ShoppingModeView
        plannedItems={[plannedItem]}
        onPurchase={() => {}}
        onDelete={() => {}}
        lowStockItems={[]}
        expiringItems={[]}
        addedItemIds={new Set()}
        onAddAlert={() => {}}
        resolveCheapestStore={() => ({ storeName: "〇〇スーパー", unitPrice: 128 })}
      />,
      { wrapper },
    );
    expect(getByText(/〇〇スーパー/)).toBeTruthy();
  });

  // #982: the shopping-list section shows an estimated total, summed from the
  // cheapest-store unit price of items resolveCheapestStore has data for.
  it("shows the estimated total summed from items with comparison data", () => {
    const secondItem = { ...plannedItem, id: "s2", name: "卵", desired_units: 2 };
    const { getByText } = render(
      <ShoppingModeView
        plannedItems={[plannedItem, secondItem]}
        onPurchase={() => {}}
        onDelete={() => {}}
        lowStockItems={[]}
        expiringItems={[]}
        addedItemIds={new Set()}
        onAddAlert={() => {}}
        resolveCheapestStore={(item) =>
          item.id === "s1" ? { storeName: "〇〇スーパー", unitPrice: 128 } : null
        }
      />,
      { wrapper },
    );
    // s1: 128 × 1 = 128 (s2 has no comparison data and is excluded)
    expect(
      getByText(i18n.t("shopping:shoppingModeEstimatedTotalValue", { price: "128" })),
    ).toBeTruthy();
    expect(getByText(i18n.t("shopping:shoppingModeEstimatedTotalPartialNote"))).toBeTruthy();
  });

  it("does not show the estimated total when no planned item has comparison data", () => {
    const { queryByText } = render(
      <ShoppingModeView
        plannedItems={[plannedItem]}
        onPurchase={() => {}}
        onDelete={() => {}}
        lowStockItems={[]}
        expiringItems={[]}
        addedItemIds={new Set()}
        onAddAlert={() => {}}
        resolveCheapestStore={() => null}
      />,
      { wrapper },
    );
    expect(queryByText(i18n.t("shopping:shoppingModeEstimatedTotalLabel"))).toBeNull();
  });

  it("does not show the estimated total when resolveCheapestStore is not provided", () => {
    const { queryByText } = render(
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
    expect(queryByText(i18n.t("shopping:shoppingModeEstimatedTotalLabel"))).toBeNull();
  });
});
