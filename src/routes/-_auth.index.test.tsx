import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useConsumeItemModule from "@/hooks/useConsumeItem";
import * as useItemsModule from "@/hooks/useItems";
import * as useMasterDataModule from "@/hooks/useMasterData";
import * as useStatsModule from "@/hooks/useStats";
import * as useUserSettingsModule from "@/hooks/useUserSettings";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";
import type { Item } from "@/types/item";

import { DashboardPage } from "./_auth.index";

const stubToast: ToastContextValue = { toasts: [], toast: () => {}, dismiss: () => {} };

const makeWrapper = (children: ReactNode) => () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: () => <>{children}</> });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ToastContext.Provider value={stubToast}>
          <RouterProvider router={router} />
        </ToastContext.Provider>
      </I18nextProvider>
    </QueryClientProvider>
  );
};

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

const renderPage = async () => {
  const Wrapper = makeWrapper(<DashboardPage />);
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<Wrapper />);
  });
  return result;
};

// Match the urgentBanner summary text in English ("1 item is expired or expiring soon" or
// "N items are expired or expiring soon") or Japanese ("N件の在庫が期限切れまたは期限間近").
// Uses the common substring "expired or expiring soon" to cover both singular and plural forms.
const URGENT_BANNER_RE = /expired or expiring soon|件の在庫が期限切れ/;

describe("DashboardPage", () => {
  let itemsspy: ReturnType<typeof spyOn>;
  let categoriesspy: ReturnType<typeof spyOn>;
  let locationsspy: ReturnType<typeof spyOn>;
  let settingsspy: ReturnType<typeof spyOn>;
  let consumespy: ReturnType<typeof spyOn>;
  let forecastspy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    itemsspy = spyOn(useItemsModule, "useItems").mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useItemsModule.useItems>);

    categoriesspy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);

    locationsspy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocations>);

    settingsspy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as unknown as ReturnType<typeof useUserSettingsModule.useUserSettings>);

    consumespy = spyOn(useConsumeItemModule, "useConsumeItem").mockReturnValue({
      mutateAsync: async () => makeItem(),
      isPending: false,
    } as unknown as ReturnType<typeof useConsumeItemModule.useConsumeItem>);

    forecastspy = spyOn(useStatsModule, "useForecastAlerts").mockReturnValue({
      alerts: [],
      isLoading: false,
      isError: false,
    });
  });

  afterEach(() => {
    itemsspy.mockRestore();
    categoriesspy.mockRestore();
    locationsspy.mockRestore();
    settingsspy.mockRestore();
    consumespy.mockRestore();
    forecastspy.mockRestore();
    cleanup();
  });

  it("期限切れアイテムがない場合に警告バナーが非表示", async () => {
    itemsspy.mockReturnValue({
      data: [makeItem({ id: "ok", expiry_date: "2099-12-31", units: 1 })],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useItemsModule.useItems>);
    const { queryByText } = await renderPage();
    expect(queryByText(URGENT_BANNER_RE)).toBeNull();
  });

  it("期限切れアイテムがある場合に警告バナーが表示される", async () => {
    itemsspy.mockReturnValue({
      data: [makeItem({ id: "expired", expiry_date: "2000-01-01", units: 1 })],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useItemsModule.useItems>);
    const { queryByText } = await renderPage();
    expect(queryByText(URGENT_BANNER_RE)).not.toBeNull();
  });

  it("期限切れアイテムが units=0 では警告バナーに含まれない", async () => {
    itemsspy.mockReturnValue({
      data: [makeItem({ id: "expired-empty", expiry_date: "2000-01-01", units: 0 })],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useItemsModule.useItems>);
    const { queryByText } = await renderPage();
    expect(queryByText(URGENT_BANNER_RE)).toBeNull();
  });

  it("hideEmpty=off でも在庫0の期限切れは警告バナー見出し件数に含めない (#450)", async () => {
    // 使い切り在庫を表示（hideEmpty=off）にした状態で、在庫あり1件＋在庫0の1件が
    // ともに期限切れのとき、見出し件数は在庫あり(units>0)の1件のみと一致すべき。
    localStorage.setItem("dashboard.hideEmpty", "false");
    try {
      itemsspy.mockReturnValue({
        data: [
          makeItem({ id: "in-stock", expiry_date: "2000-01-01", units: 2 }),
          makeItem({ id: "empty", expiry_date: "2000-01-01", units: 0 }),
        ],
        isLoading: false,
        error: null,
      } as ReturnType<typeof useItemsModule.useItems>);
      const { getByText, queryByText } = await renderPage();
      // 在庫あり1件のみが見出しに反映され、内訳・一括追加ボタンの対象件数と一致する
      expect(getByText(/1 item is expired or expiring soon|1件の在庫が期限切れ/)).not.toBeNull();
      expect(queryByText(/2 items are expired or expiring soon|2件の在庫が期限切れ/)).toBeNull();
    } finally {
      localStorage.removeItem("dashboard.hideEmpty");
    }
  });

  it("期限フィルターを「正常」にしても期限切れ警告バナーが表示され続ける (#391)", async () => {
    itemsspy.mockReturnValue({
      data: [
        makeItem({ id: "expired", expiry_date: "2000-01-01", units: 1 }),
        makeItem({ id: "ok-item", expiry_date: "2099-12-31", units: 1 }),
      ],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useItemsModule.useItems>);

    const { getByLabelText, queryByText, getAllByRole } = await renderPage();

    // フィルターパネルを開く（aria-label は i18n キー "filter" の翻訳値）
    const filterBtn = getByLabelText(/filter|絞り込み/i);
    await act(async () => {
      fireEvent.click(filterBtn);
    });

    // 期限フィルターを「正常」に変更（3番目のselect: カテゴリ/保管場所/期限/ソート）
    const selects = getAllByRole("combobox");
    await act(async () => {
      fireEvent.change(selects[2]!, { target: { value: "ok" } });
    });

    // filtered には ok アイテムのみが入るが、urgentItems は全アイテムから計算されるため
    // 期限切れアイテムがある警告バナーは引き続き表示されるべき
    expect(queryByText(URGENT_BANNER_RE)).not.toBeNull();
  });

  it("hideEmpty=false のとき、期限切れ在庫0個アイテムはバナー見出しの件数にも含まれない (#450)", async () => {
    itemsspy.mockReturnValue({
      data: [
        makeItem({ id: "expired-empty", expiry_date: "2000-01-01", units: 0 }),
        makeItem({ id: "ok-item", expiry_date: "2099-12-31", units: 1 }),
      ],
      isLoading: false,
      error: null,
    } as ReturnType<typeof useItemsModule.useItems>);

    const { getByLabelText, queryByText } = await renderPage();

    // フィルターパネルを開いて「使い切り在庫を隠す」をオフにする（units=0のアイテムも表示対象に含める）
    const filterBtn = getByLabelText(/filter|絞り込み/i);
    await act(async () => {
      fireEvent.click(filterBtn);
    });
    const hideEmptyCheckbox = getByLabelText(/hide empty items|使い切り在庫を隠す/i);
    await act(async () => {
      fireEvent.click(hideEmptyCheckbox);
    });

    // アコーディオン内訳/一括追加ボタンの対象は units>0 のみなので、
    // 見出しの件数も同じ集合から算出されるべき（units=0の期限切れは含まれない）
    expect(queryByText(URGENT_BANNER_RE)).toBeNull();
  });

  it("検索で一覧を絞り込んでも棚卸しアラートは全在庫を対象にし続ける (#375)", async () => {
    const staleItem = makeItem({
      id: "stale",
      name: "棚卸し対象",
      created_at: "2020-01-01T00:00:00Z",
      last_verified_at: null,
    });
    itemsspy.mockImplementation(
      (filters = {}) =>
        ({
          data: filters.search ? [] : [staleItem],
          isLoading: false,
          error: null,
        }) as ReturnType<typeof useItemsModule.useItems>,
    );
    settingsspy.mockReturnValue({
      data: { stocktake_alert_enabled: true, stocktake_alert_days: 90 },
      isLoading: false,
    } as unknown as ReturnType<typeof useUserSettingsModule.useUserSettings>);

    const user = userEvent.setup();
    const { getByPlaceholderText, queryByText } = await renderPage();
    const banner = /needs stock verification|在庫確認が必要/;
    expect(queryByText(banner)).not.toBeNull();

    await user.type(getByPlaceholderText(/search by name|商品名・バーコードで検索/i), "missing");
    await waitFor(() => {
      const filteredCall = itemsspy.mock.calls.findLast(
        ([filters]) => filters?.search === "missing",
      );
      expect(filteredCall).toBeDefined();
    });

    expect(queryByText(banner)).not.toBeNull();
  });

  it("検索欄への入力はデバウンスされ、キー入力ごとにuseItemsを再クエリしない (#452)", async () => {
    const user = userEvent.setup();
    const { getByPlaceholderText } = await renderPage();

    const searchInput = getByPlaceholderText(/search by name|商品名・バーコードで検索/i);
    await user.type(searchInput, "milk");

    // デバウンス時間(300ms)内はuseItemsに新しいsearchがまだ渡らない
    const lastCallRightAfterTyping = itemsspy.mock.calls.at(-1)?.[0] as
      | { search?: string }
      | undefined;
    expect(lastCallRightAfterTyping?.search).not.toBe("milk");

    // デバウンス完了後、URLに反映されuseItemsが新しいsearchで呼ばれる
    await waitFor(
      () => {
        const lastCall = itemsspy.mock.calls.at(-1)?.[0] as { search?: string } | undefined;
        expect(lastCall?.search).toBe("milk");
      },
      { timeout: 2000 },
    );
  });

  it("検索で一覧を絞り込んでも低在庫バナーは全在庫を対象にし続ける (#618)", async () => {
    const lowStockItem = makeItem({
      id: "low-stock",
      name: "低在庫商品",
      units: 0,
      minimum_stock: 2,
    } as Partial<Item>);
    itemsspy.mockImplementation(
      (filters = {}) =>
        ({
          data: filters.search ? [] : [lowStockItem],
          isLoading: false,
          error: null,
        }) as ReturnType<typeof useItemsModule.useItems>,
    );

    const user = userEvent.setup();
    const { getByPlaceholderText, queryByText } = await renderPage();
    const banner = /low on stock|最低在庫数以下/i;
    expect(queryByText(banner)).not.toBeNull();

    await user.type(getByPlaceholderText(/search by name|商品名・バーコードで検索/i), "missing");
    await waitFor(() => {
      const filteredCall = itemsspy.mock.calls.findLast(
        ([filters]) => filters?.search === "missing",
      );
      expect(filteredCall).toBeDefined();
    });

    expect(queryByText(banner)).not.toBeNull();
  });

  it("カテゴリ・保管場所で絞り込んでも期限切れ警告バナーは全在庫を対象にし続ける (#618)", async () => {
    itemsspy.mockImplementation(
      (filters = {}) =>
        ({
          data: filters.categoryId
            ? []
            : [makeItem({ id: "expired", expiry_date: "2000-01-01", units: 1 })],
          isLoading: false,
          error: null,
        }) as ReturnType<typeof useItemsModule.useItems>,
    );
    categoriesspy.mockReturnValue({
      data: [{ id: "cat-1", name: "飲料" }],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);

    const { getByLabelText, queryByText, getAllByRole } = await renderPage();
    expect(queryByText(URGENT_BANNER_RE)).not.toBeNull();

    const filterBtn = getByLabelText(/filter|絞り込み/i);
    await act(async () => {
      fireEvent.click(filterBtn);
    });
    const selects = getAllByRole("combobox");
    await act(async () => {
      fireEvent.change(selects[0]!, { target: { value: "cat-1" } });
    });
    await waitFor(() => {
      const filteredCall = itemsspy.mock.calls.findLast(
        ([filters]) => filters?.categoryId === "cat-1",
      );
      expect(filteredCall).toBeDefined();
    });

    expect(queryByText(URGENT_BANNER_RE)).not.toBeNull();
  });

  it("検索がデバウンス確定してもフォーカスが外れない（再マウントしない） (#527)", async () => {
    const user = userEvent.setup();
    const { getByPlaceholderText } = await renderPage();

    const searchInput = getByPlaceholderText(
      /search by name|商品名・バーコードで検索/i,
    ) as HTMLInputElement;
    searchInput.focus();
    await user.type(searchInput, "milk");

    // デバウンス確定 → URL更新 → 再レンダリング後もフォーカスが保持されている
    await waitFor(
      () => {
        const lastCall = itemsspy.mock.calls.at(-1)?.[0] as { search?: string } | undefined;
        expect(lastCall?.search).toBe("milk");
      },
      { timeout: 2000 },
    );
    expect(document.activeElement).toBe(searchInput);
  });
});
