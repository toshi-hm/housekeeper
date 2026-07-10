import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { CalendarPage } from "@/components/pages/CalendarPage";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";
import { createHookWrapper, makeItem } from "@/test/testUtils";
import type { Category } from "@/types/item";

const fmt = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
};

const today = new Date();
today.setHours(0, 0, 0, 0);
const addDays = (n: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + n);
  return d;
};

const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: "cat-1",
  user_id: "user-1",
  name: "食品",
  color: "#ff0000",
  icon: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

const renderPage = (props: Partial<Parameters<typeof CalendarPage>[0]> = {}) => {
  const { wrapper: Wrapper } = createHookWrapper();
  const defaultProps = {
    items: [],
    categories: [],
    isLoading: false,
    onCheck: () => Promise.resolve(),
    onUndo: () => Promise.resolve(),
    pendingRemovals: [],
  };
  return render(
    <Wrapper>
      <CalendarPage {...defaultProps} {...props} />
    </Wrapper>,
  );
};

describe("CalendarPage", () => {
  test("isLoading 中はスピナーを表示する", () => {
    const { container } = renderPage({ isLoading: true });
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  test("アイテムがない場合は空状態を表示する", () => {
    const { container } = renderPage({ items: [] });
    expect(container.querySelector("svg.lucide-calendar-days")).not.toBeNull();
  });

  test("期限ごとに expired / thisWeek / thisMonth に振り分ける", () => {
    const weekLater = addDays(7);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const expiredItem = makeItem({
      id: "i-expired",
      name: "期限切れアイテム",
      expiry_date: fmt(addDays(-1)),
      category_id: "cat-1",
    });
    const weekItem = makeItem({
      id: "i-week",
      name: "今週アイテム",
      expiry_date: fmt(addDays(1)),
    });

    const items = [expiredItem, weekItem];

    // 月末が「1週間後」より先の場合のみ thisMonth グループが存在しうる
    const canHaveThisMonth = monthEnd.getTime() > weekLater.getTime();
    if (canHaveThisMonth) {
      items.push(makeItem({ id: "i-month", name: "今月アイテム", expiry_date: fmt(monthEnd) }));
    }

    const { getAllByText } = renderPage({ items, categories: [makeCategory()] });

    expect(getAllByText(/期限切れアイテム/).length).toBeGreaterThan(0);
    expect(getAllByText(/今週アイテム/).length).toBeGreaterThan(0);
    if (canHaveThisMonth) {
      expect(getAllByText(/今月アイテム/).length).toBeGreaterThan(0);
    }
  });

  test("expiry_date がないアイテムはどのグループにも入らない", () => {
    const { queryAllByText } = renderPage({
      items: [makeItem({ id: "i-none", name: "期限なし", expiry_date: null })],
    });
    expect(queryAllByText(/期限なし/)).toHaveLength(0);
  });

  test("pendingRemovals があると undo ボタンを表示し、クリックで onUndo を呼ぶ", async () => {
    const onUndo = mock(() => Promise.resolve());
    const { getByText } = renderPage({
      pendingRemovals: [{ itemId: "item-1", itemName: "牛乳" }],
      onUndo,
    });

    const undoButton = getByText(/牛乳/);
    fireEvent.click(undoButton);

    await waitFor(() => expect(onUndo).toHaveBeenCalledWith("item-1"));
  });

  test("onUndo が失敗すると error トーストを出す", async () => {
    const toastCalls: Array<{ message: string; variant?: string }> = [];
    const toastValue: ToastContextValue = {
      toasts: [],
      toast: (message, variant) => {
        toastCalls.push({ message, variant });
      },
      dismiss: () => {},
    };

    const wrapper = ({ children }: { children: ReactNode }) => (
      <I18nextProvider i18n={i18n}>
        <ToastContext.Provider value={toastValue}>{children}</ToastContext.Provider>
      </I18nextProvider>
    );

    const { getByText } = render(
      <CalendarPage
        items={[]}
        categories={[]}
        isLoading={false}
        onCheck={() => Promise.resolve()}
        onUndo={() => Promise.reject(new Error("undo failed"))}
        pendingRemovals={[{ itemId: "item-1", itemName: "牛乳" }]}
      />,
      { wrapper },
    );

    fireEvent.click(getByText(/牛乳/));

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "error")).toBe(true));
  });
});

describe("CalendarPage (カテゴリ色と月外アイテムの分岐)", () => {
  test("カテゴリ色の有無・未分類・月外アイテムを処理できる", () => {
    const weekLater = addDays(7);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const canHaveThisMonth = monthEnd.getTime() > weekLater.getTime();

    const categoriesData = [
      makeCategory({ id: "cat-color", color: "#00ff00" }),
      makeCategory({ id: "cat-nocolor", color: null }),
    ];

    const items = [
      // expired: 色なしカテゴリ (?? null 分岐)
      makeItem({
        id: "e-1",
        name: "期限切れ色なし",
        expiry_date: fmt(addDays(-1)),
        category_id: "cat-nocolor",
      }),
      // expired: カテゴリなし
      makeItem({ id: "e-2", name: "期限切れ未分類", expiry_date: fmt(addDays(-1)) }),
      // thisWeek: 色ありカテゴリ
      makeItem({
        id: "w-1",
        name: "今週色あり",
        expiry_date: fmt(addDays(1)),
        category_id: "cat-color",
      }),
      // 月を超えるアイテムはどのグループにも入らない
      makeItem({ id: "far-1", name: "遠い将来", expiry_date: "2099-12-31" }),
    ];

    if (canHaveThisMonth) {
      items.push(
        makeItem({
          id: "m-1",
          name: "今月色あり",
          expiry_date: fmt(monthEnd),
          category_id: "cat-color",
        }),
        makeItem({
          id: "m-2",
          name: "今月色なし",
          expiry_date: fmt(monthEnd),
          category_id: "cat-nocolor",
        }),
      );
    }

    const { getAllByText, queryAllByText } = renderPage({ items, categories: categoriesData });

    expect(getAllByText(/期限切れ色なし/).length).toBeGreaterThan(0);
    expect(getAllByText(/期限切れ未分類/).length).toBeGreaterThan(0);
    expect(getAllByText(/今週色あり/).length).toBeGreaterThan(0);
    // 月外アイテムはリスト (ExpiryCheckItem) に表示されない
    expect(queryAllByText(/遠い将来/)).toHaveLength(0);
    if (canHaveThisMonth) {
      expect(getAllByText(/今月色あり/).length).toBeGreaterThan(0);
      expect(getAllByText(/今月色なし/).length).toBeGreaterThan(0);
    }
  });
});
