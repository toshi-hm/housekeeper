import { render } from "@testing-library/react";
import { describe, expect, it } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";
import type { Category, Item } from "@/types/item";

import { CalendarPage } from "./CalendarPage";

const stubToast: ToastContextValue = { toasts: [], toast: () => {}, dismiss: () => {} };

const wrapper = ({ children }: { children: ReactNode }) => (
  <I18nextProvider i18n={i18n}>
    <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
  </I18nextProvider>
);

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: "item-1",
  user_id: "user-1",
  name: "テスト",
  barcode: null,
  category_id: null,
  storage_location_id: null,
  units: 1,
  content_amount: 1,
  content_unit: "個",
  opened_remaining: null,
  purchase_date: null,
  expiry_date: null,
  notes: null,
  image_path: null,
  deleted_at: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: "cat-1",
  user_id: "user-1",
  name: "洗剤",
  color: null,
  icon: null,
  days_use_after_opening: null,
  kind: "food",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const noop = async () => {};

describe("CalendarPage — 日用品切り替え後の残存期限を除外する (#937)", () => {
  it("実効種別が日用品のアイテムは期限切れ・今週・今月のいずれにも表示されない", () => {
    const pastExpiry = new Date();
    pastExpiry.setDate(pastExpiry.getDate() - 1);
    const expiryDate = pastExpiry.toISOString().slice(0, 10);

    const dailyGoodsCategory = makeCategory({ id: "cat-goods", name: "洗剤", kind: "daily_goods" });
    const item = makeItem({
      id: "wrap",
      name: "ラップ",
      category_id: "cat-goods",
      expiry_date: expiryDate,
    });

    const { queryByText, getByText } = render(
      <CalendarPage
        items={[item]}
        categories={[dailyGoodsCategory]}
        isLoading={false}
        onCheck={noop}
        onUndo={noop}
        pendingRemovals={[]}
      />,
      { wrapper },
    );

    expect(queryByText("ラップ")).toBeNull();
    expect(getByText(i18n.t("calendar:noExpired"))).toBeTruthy();
  });

  it("実効種別が食料品のアイテムは通常どおり期限切れに表示される", () => {
    const pastExpiry = new Date();
    pastExpiry.setDate(pastExpiry.getDate() - 1);
    const expiryDate = pastExpiry.toISOString().slice(0, 10);

    const foodCategory = makeCategory({ id: "cat-food", name: "冷蔵庫", kind: "food" });
    const item = makeItem({
      id: "milk",
      name: "牛乳",
      category_id: "cat-food",
      expiry_date: expiryDate,
    });

    const { getByText } = render(
      <CalendarPage
        items={[item]}
        categories={[foodCategory]}
        isLoading={false}
        onCheck={noop}
        onUndo={noop}
        pendingRemovals={[]}
      />,
      { wrapper },
    );

    expect(getByText("牛乳")).toBeTruthy();
  });
});
