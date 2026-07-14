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
  });

  afterEach(() => {
    itemsspy.mockRestore();
    categoriesspy.mockRestore();
    locationsspy.mockRestore();
    settingsspy.mockRestore();
    consumespy.mockRestore();
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
