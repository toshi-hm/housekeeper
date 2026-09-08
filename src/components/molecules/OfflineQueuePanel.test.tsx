import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import type { OfflineQueuedAction } from "@/lib/offlineActionQueue";
import type { ItemFormValues } from "@/types/item";

import { OfflineQueuePanel } from "./OfflineQueuePanel";

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
);

const makeFormValues = (name: string): ItemFormValues =>
  ({
    name,
    barcode: "",
    category_id: null,
    storage_location_id: null,
    units: 1,
    content_amount: 1,
    content_unit: "個",
    opened_remaining: null,
    purchase_date: "",
    expiry_date: "",
    notes: "",
    image_path: "",
  }) as ItemFormValues;

const purchaseAction = (id: string, name: string): OfflineQueuedAction => ({
  id,
  kind: "purchase",
  payload: { shoppingItemId: id, itemValues: makeFormValues(name), applyMergeFields: false },
  queuedAt: new Date().toISOString(),
});

const addAlertAction = (id: string, name: string): OfflineQueuedAction => ({
  id,
  kind: "add-alert",
  payload: { name, linked_item_id: id },
  queuedAt: new Date().toISOString(),
});

describe("OfflineQueuePanel", () => {
  it("actionsが空なら何も描画しない", () => {
    const { container } = render(<OfflineQueuePanel actions={[]} onRequestDiscard={() => {}} />, {
      wrapper,
    });
    expect(container.firstChild).toBeNull();
  });

  it("件数をタイトルに表示し、初期状態では一覧を折りたたんでいる", () => {
    const { getByText, queryByText } = render(
      <OfflineQueuePanel actions={[purchaseAction("1", "牛乳")]} onRequestDiscard={() => {}} />,
      { wrapper },
    );
    expect(getByText(i18n.t("shopping:offlineQueuePanelTitle", { count: 1 }))).toBeTruthy();
    expect(queryByText("牛乳")).toBeNull();
  });

  it("展開すると各アクションの名前と種別を表示する", () => {
    const { getByRole, getByText } = render(
      <OfflineQueuePanel
        actions={[purchaseAction("1", "牛乳"), addAlertAction("2", "卵")]}
        onRequestDiscard={() => {}}
      />,
      { wrapper },
    );
    fireEvent.click(
      getByRole("button", { name: i18n.t("shopping:offlineQueuePanelTitle", { count: 2 }) }),
    );
    expect(getByText("牛乳")).toBeTruthy();
    expect(getByText(i18n.t("shopping:offlineQueuePanelKindPurchase"))).toBeTruthy();
    expect(getByText("卵")).toBeTruthy();
    expect(getByText(i18n.t("shopping:offlineQueuePanelKindAddAlert"))).toBeTruthy();
  });

  it("破棄ボタンをクリックすると対象のアクションでonRequestDiscardを呼ぶ", () => {
    const action = purchaseAction("1", "牛乳");
    const onRequestDiscard = mock(() => {});
    const { getByRole } = render(
      <OfflineQueuePanel actions={[action]} onRequestDiscard={onRequestDiscard} />,
      { wrapper },
    );
    fireEvent.click(
      getByRole("button", { name: i18n.t("shopping:offlineQueuePanelTitle", { count: 1 }) }),
    );
    fireEvent.click(
      getByRole("button", {
        name: i18n.t("shopping:offlineQueuePanelDiscardAriaLabel", { name: "牛乳" }),
      }),
    );
    expect(onRequestDiscard).toHaveBeenCalledTimes(1);
    expect(onRequestDiscard).toHaveBeenCalledWith(action);
  });
});
