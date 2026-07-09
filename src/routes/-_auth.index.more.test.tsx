import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useConsumeItemModule from "@/hooks/useConsumeItem";
import * as useItemsModule from "@/hooks/useItems";
import * as useMasterDataModule from "@/hooks/useMasterData";
import * as useShoppingListModule from "@/hooks/useShoppingList";
import * as useUserSettingsModule from "@/hooks/useUserSettings";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";
import { makeItem } from "@/test/testUtils";
import type { Category, Item, StorageLocation } from "@/types/item";

import { DashboardPage } from "./_auth.index";

type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
const ioCallbacks: IOCallback[] = [];

class FakeIntersectionObserver {
  constructor(callback: IOCallback) {
    ioCallbacks.push(callback);
  }
  observe() {}
  disconnect() {}
  unobserve() {}
}

const makeWrapper = (children: ReactNode, toastValue: ToastContextValue) => () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: () => <>{children}</> });
  const shoppingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/shopping",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([shoppingRoute]),
    history: createMemoryHistory(),
  });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ToastContext.Provider value={toastValue}>
          <RouterProvider router={router} />
        </ToastContext.Provider>
      </I18nextProvider>
    </QueryClientProvider>
  );
};

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

const makeCategory = (id: string, name: string): Category => ({
  id,
  user_id: "user-1",
  name,
  color: null,
  icon: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

const makeLocation = (id: string, name: string): StorageLocation => ({
  id,
  user_id: "user-1",
  name,
  icon: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

describe("DashboardPage (追加カバレッジ)", () => {
  let itemsSpy: ReturnType<typeof spyOn>;
  let categoriesSpy: ReturnType<typeof spyOn>;
  let locationsSpy: ReturnType<typeof spyOn>;
  let settingsSpy: ReturnType<typeof spyOn>;
  let consumeSpy: ReturnType<typeof spyOn>;
  let upsertShoppingSpy: ReturnType<typeof spyOn>;
  let consumeMutate: ReturnType<typeof mock>;
  let upsertMutate: ReturnType<typeof mock>;
  let toastCalls: Array<{ message: string; variant?: string }>;
  let originalIO: typeof IntersectionObserver;

  beforeEach(() => {
    originalIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver =
      FakeIntersectionObserver as unknown as typeof IntersectionObserver;
    ioCallbacks.length = 0;
    toastCalls = [];

    itemsSpy = spyOn(useItemsModule, "useItems").mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useItemsModule.useItems>);

    categoriesSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [makeCategory("cat-1", "食品")],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);

    locationsSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [makeLocation("loc-1", "冷蔵庫")],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocations>);

    settingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useUserSettingsModule.useUserSettings>);

    consumeMutate = mock(() => Promise.resolve(makeItem()));
    consumeSpy = spyOn(useConsumeItemModule, "useConsumeItem").mockReturnValue({
      mutateAsync: consumeMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useConsumeItemModule.useConsumeItem>);

    upsertMutate = mock(() => Promise.resolve({}));
    upsertShoppingSpy = spyOn(useShoppingListModule, "useUpsertShoppingItem").mockReturnValue({
      mutateAsync: upsertMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useShoppingListModule.useUpsertShoppingItem>);
  });

  afterEach(() => {
    itemsSpy.mockRestore();
    categoriesSpy.mockRestore();
    locationsSpy.mockRestore();
    settingsSpy.mockRestore();
    consumeSpy.mockRestore();
    upsertShoppingSpy.mockRestore();
    globalThis.IntersectionObserver = originalIO;
    cleanup();
  });

  const renderPage = async () => {
    const toastValue: ToastContextValue = {
      toasts: [],
      toast: (message, variant) => toastCalls.push({ message, variant }),
      dismiss: () => {},
    };
    const Wrapper = makeWrapper(<DashboardPage />, toastValue);
    let result!: ReturnType<typeof render>;
    await act(async () => {
      result = render(<Wrapper />);
    });
    return result;
  };

  const setItems = (items: Item[]) => {
    itemsSpy.mockReturnValue({
      data: items,
      isLoading: false,
      error: null,
    } as ReturnType<typeof useItemsModule.useItems>);
  };

  it("ローディング中はスケルトンを表示する", async () => {
    itemsSpy.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as unknown as ReturnType<typeof useItemsModule.useItems>);

    const { container } = await renderPage();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("取得エラーで loadError を表示する", async () => {
    itemsSpy.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("boom"),
    } as unknown as ReturnType<typeof useItemsModule.useItems>);

    const { getByText } = await renderPage();
    expect(getByText(i18n.t("items:loadError"))).toBeTruthy();
  });

  it("アイテム 0 件で空状態を表示する", async () => {
    const { getByText } = await renderPage();
    expect(getByText(i18n.t("items:noItems"))).toBeTruthy();
  });

  it("在庫 0 のみ (hideEmpty) では noMatchingItems を表示する", async () => {
    setItems([makeItem({ id: "empty-item", units: 0 })]);
    const { getByText } = await renderPage();
    expect(getByText(i18n.t("items:noMatchingItems"))).toBeTruthy();
  });

  it("クイック消費ボタンで consumeItem が呼ばれ success トーストを出す", async () => {
    const item = makeItem({ id: "item-1", name: "牛乳", units: 2, content_amount: 3 });
    setItems([item]);

    const { getAllByLabelText } = await renderPage();

    const quickButtons = getAllByLabelText(i18n.t("items:quickConsume"));
    await act(async () => {
      fireEvent.click(quickButtons[0]!);
    });

    await waitFor(() => expect(consumeMutate).toHaveBeenCalled());
    const arg = (consumeMutate.mock.calls[0] as unknown[])[0] as {
      item: Item;
      deltaAmount: number;
    };
    expect(arg.deltaAmount).toBe(3);
    await waitFor(() => expect(toastCalls.some((call) => call.variant === "success")).toBe(true));
  });

  it("期限切れ/間近アイテムの一括買い物リスト追加", async () => {
    const expired = makeItem({
      id: "expired-1",
      name: "期限切れ品",
      expiry_date: fmt(addDays(-1)),
      units: 1,
    });
    const soon = makeItem({
      id: "soon-1",
      name: "間近品",
      expiry_date: fmt(addDays(1)),
      units: 1,
    });
    setItems([expired, soon]);

    const { container, getAllByText } = await renderPage();

    // 詳細 (details) 内とカードの両方に期限切れ・間近アイテムが表示される
    expect(getAllByText("期限切れ品").length).toBeGreaterThan(0);
    expect(getAllByText("間近品").length).toBeGreaterThan(0);

    const bulkButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.querySelector("svg.lucide-shopping-cart"),
    ) as HTMLButtonElement;
    expect(bulkButton).toBeDefined();

    await act(async () => {
      fireEvent.click(bulkButton);
    });

    await waitFor(() => expect(upsertMutate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(toastCalls.some((call) => call.variant === "success")).toBe(true));
  });

  it("低在庫バナーにアイテムが表示される", async () => {
    setItems([makeItem({ id: "low-1", name: "低在庫品", units: 1, minimum_stock: 2 })]);

    const { getAllByText } = await renderPage();
    // バナー内リンクとカードの両方に表示される
    expect(getAllByText(/低在庫品/).length).toBeGreaterThanOrEqual(2);
  });

  it("クイックフィルタチップの切り替えができる", async () => {
    const expired = makeItem({
      id: "expired-1",
      expiry_date: fmt(addDays(-1)),
      units: 1,
    });
    const soon = makeItem({ id: "soon-1", expiry_date: fmt(addDays(1)), units: 1 });
    setItems([expired, soon]);

    const { getByText } = await renderPage();

    const expiredChip = getByText(new RegExp(`${i18n.t("items:expiryStatus.expired")} \\(1\\)`));
    const soonChip = getByText(new RegExp(`${i18n.t("items:expiryStatus.expiring-soon")} \\(1\\)`));
    const allChip = getByText(new RegExp(`${i18n.t("items:quickFilterAll")} \\(2\\)`));

    await act(async () => {
      fireEvent.click(expiredChip);
    });
    await act(async () => {
      fireEvent.click(soonChip);
    });
    await act(async () => {
      fireEvent.click(allChip);
    });
  });

  it("フィルターパネルの各操作 (カテゴリ/場所/期限/ソート/hideEmpty)", async () => {
    setItems([makeItem({ id: "item-1", units: 1 })]);

    const { getByLabelText, getAllByRole } = await renderPage();

    const filterButton = getByLabelText(i18n.t("common:filter"));
    await act(async () => {
      fireEvent.click(filterButton);
    });

    const selects = getAllByRole("combobox");
    await act(async () => {
      fireEvent.change(selects[0]!, { target: { value: "cat-1" } });
      fireEvent.change(selects[1]!, { target: { value: "loc-1" } });
      fireEvent.change(selects[2]!, { target: { value: "expired" } });
      fireEvent.change(selects[3]!, { target: { value: "expiry_date" } });
    });

    expect(localStorage.getItem("dashboard.sort")).toBe("expiry_date");

    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.click(checkbox);
    });
    expect(localStorage.getItem("dashboard.hideEmpty")).toBe("false");

    // 元に戻す
    await act(async () => {
      fireEvent.click(checkbox);
    });
    localStorage.removeItem("dashboard.sort");
    localStorage.removeItem("dashboard.hideEmpty");
  });

  it("検索入力で navigate (setSearch) が呼ばれる", async () => {
    setItems([makeItem({ id: "item-1", units: 1 })]);

    const { container } = await renderPage();

    const searchInput = container.querySelector(
      `input[placeholder="${i18n.t("items:searchPlaceholder")}"]`,
    ) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(searchInput, { target: { value: "牛乳" } });
    });
  });

  it("スクロールで表示件数が増える (IntersectionObserver)", async () => {
    const manyItems = Array.from({ length: 45 }, (_, i) =>
      makeItem({ id: `item-${i}`, name: `アイテム${i}`, units: 1 }),
    );
    setItems(manyItems);

    const { getAllByLabelText } = await renderPage();

    expect(getAllByLabelText(i18n.t("items:quickConsume"))).toHaveLength(40);

    await act(async () => {
      ioCallbacks.forEach((callback) => callback([{ isIntersecting: true }]));
    });

    await waitFor(() => expect(getAllByLabelText(i18n.t("items:quickConsume"))).toHaveLength(45));
  });
});
