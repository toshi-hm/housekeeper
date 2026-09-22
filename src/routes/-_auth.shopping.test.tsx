// #1020回帰テスト（下部の describe ブロック）が、キューに積んだ購入確定に添付された
// 画像を実際にIndexedDB（`@/lib/offlinePendingPurchaseImage`）へ保存・取り出しできる
// ことまで検証するため、happy-domには無いIndexedDBをこのファイル全体にpolyfillする。
// 他のdescribeブロックはIndexedDBを使わないため無害。
import "fake-indexeddb/auto";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { I18nextProvider } from "react-i18next";

import * as ItemFormModule from "@/components/organisms/ItemForm";
import * as useItemImageModule from "@/hooks/useItemImage";
import * as useItemsModule from "@/hooks/useItems";
import * as useMasterDataModule from "@/hooks/useMasterData";
import * as useShoppingListModule from "@/hooks/useShoppingList";
import * as useShoppingTemplatesModule from "@/hooks/useShoppingTemplates";
import * as useStatsModule from "@/hooks/useStats";
import * as useUserSettingsModule from "@/hooks/useUserSettings";
import i18n from "@/lib/i18n";
import { readOfflineActionQueue } from "@/lib/offlineActionQueue";
import {
  ToastContext,
  type ToastContextValue,
  type ToastOptions,
  type ToastVariant,
} from "@/lib/toast-context";
import type { ItemFormValues } from "@/types/item";

import { ShoppingPage } from "./_auth.shopping";

// #1020回帰テスト用: ItemForm はバーコードスキャン・画像アップロード・マスタデータ等
// 多くのフックを引き込むため、NewItemPage.test.tsx と同じ方針で軽量スタブに差し替え、
// 「ファイル選択→送信」だけを最小限の操作で再現できるようにする。mock.module() ではなく
// spyOn + mockRestore を使う理由も同じ（ItemForm.test.tsx が同一プロセスで実物の
// ItemForm を検証しており、mock.module() はプロセス全体に波及してそちらへ漏れ得るため）。
const minimalPurchaseFormValues: ItemFormValues = {
  name: "テスト商品",
  units: 1,
  content_amount: 1,
  content_unit: "個",
};

const StubItemFormForPurchase = ({
  onSubmit,
  onPendingFileChange,
}: {
  onSubmit: (values: ItemFormValues) => void;
  onPendingFileChange?: (file: File | null) => void;
}) => (
  <div>
    <button
      type="button"
      data-testid="select-pending-file"
      onClick={() => onPendingFileChange?.(new File(["x"], "photo.jpg", { type: "image/jpeg" }))}
    >
      select file
    </button>
    <button
      type="button"
      data-testid="submit-purchase-form"
      onClick={() => onSubmit(minimalPurchaseFormValues)}
    >
      submit
    </button>
  </div>
);

const stubToast: ToastContextValue = { toasts: [], toast: () => {}, dismiss: () => {} };

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
      </I18nextProvider>
    </QueryClientProvider>
  );
};

const renderPage = () => render(<ShoppingPage />, { wrapper: Wrapper as React.ComponentType });

describe("ShoppingPage - 買い物中モードのローディング判定 (#986)", () => {
  let shoppingListSpy: ReturnType<typeof spyOn>;
  let itemsSpy: ReturnType<typeof spyOn>;
  let categoriesSpy: ReturnType<typeof spyOn>;
  let userSettingsSpy: ReturnType<typeof spyOn>;
  let templatesSpy: ReturnType<typeof spyOn>;
  let forecastAlertsSpy: ReturnType<typeof spyOn>;
  let storePriceComparisonsSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    localStorage.setItem("shopping.mode", "1");

    shoppingListSpy = spyOn(useShoppingListModule, "useShoppingList").mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useShoppingListModule.useShoppingList>);

    itemsSpy = spyOn(useItemsModule, "useItems").mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItems>);

    categoriesSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useMasterDataModule.useCategories>);

    userSettingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);

    templatesSpy = spyOn(useShoppingTemplatesModule, "useShoppingTemplates").mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useShoppingTemplatesModule.useShoppingTemplates>);

    forecastAlertsSpy = spyOn(useStatsModule, "useForecastAlerts").mockReturnValue({
      alerts: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStatsModule.useForecastAlerts>);

    storePriceComparisonsSpy = spyOn(useStatsModule, "useStorePriceComparisons").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStatsModule.useStorePriceComparisons>);
  });

  afterEach(() => {
    shoppingListSpy.mockRestore();
    itemsSpy.mockRestore();
    categoriesSpy.mockRestore();
    userSettingsSpy.mockRestore();
    templatesSpy.mockRestore();
    forecastAlertsSpy.mockRestore();
    storePriceComparisonsSpy.mockRestore();
    localStorage.removeItem("shopping.mode");
    cleanup();
  });

  it("消費ペース予測アラート取得中は「確認することはありません」を誤表示せずローディング表示にする", () => {
    forecastAlertsSpy.mockReturnValue({
      alerts: [],
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useStatsModule.useForecastAlerts>);

    const { queryByText, container } = renderPage();

    expect(
      queryByText(/shoppingModeAllClear|買い物中に確認することはありません|Nothing to check/),
    ).toBeNull();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
  });

  it("消費ペース予測アラート取得が完了し他に確認事項がなければ「確認することはありません」を表示する", () => {
    const { getByText } = renderPage();

    expect(
      getByText(/shoppingModeAllClear|買い物中に確認することはありません|Nothing to check/),
    ).toBeDefined();
  });

  it("買い物中モードOFF時は消費ペース予測アラートの取得状態に影響されない", () => {
    localStorage.removeItem("shopping.mode");
    forecastAlertsSpy.mockReturnValue({
      alerts: [],
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useStatsModule.useForecastAlerts>);

    const { queryByText } = renderPage();

    // 通常モード（一覧表示）なので、買い物中モード特有の空表示は出ない。
    expect(
      queryByText(/shoppingModeAllClear|買い物中に確認することはありません|Nothing to check/),
    ).toBeNull();
  });
});

describe("ShoppingPage - クエリのエラー状態表示 (#1094)", () => {
  let shoppingListSpy: ReturnType<typeof spyOn>;
  let itemsSpy: ReturnType<typeof spyOn>;
  let categoriesSpy: ReturnType<typeof spyOn>;
  let userSettingsSpy: ReturnType<typeof spyOn>;
  let templatesSpy: ReturnType<typeof spyOn>;
  let forecastAlertsSpy: ReturnType<typeof spyOn>;
  let storePriceComparisonsSpy: ReturnType<typeof spyOn>;

  const refetchShoppingList = mock(async () => ({}) as never);
  const refetchItems = mock(async () => ({}) as never);
  const refetchCategories = mock(async () => ({}) as never);

  beforeEach(() => {
    refetchShoppingList.mockClear();
    refetchItems.mockClear();
    refetchCategories.mockClear();

    shoppingListSpy = spyOn(useShoppingListModule, "useShoppingList").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: refetchShoppingList,
    } as unknown as ReturnType<typeof useShoppingListModule.useShoppingList>);

    itemsSpy = spyOn(useItemsModule, "useItems").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: refetchItems,
    } as unknown as ReturnType<typeof useItemsModule.useItems>);

    categoriesSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: refetchCategories,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);

    userSettingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);

    templatesSpy = spyOn(useShoppingTemplatesModule, "useShoppingTemplates").mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useShoppingTemplatesModule.useShoppingTemplates>);

    forecastAlertsSpy = spyOn(useStatsModule, "useForecastAlerts").mockReturnValue({
      alerts: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStatsModule.useForecastAlerts>);

    storePriceComparisonsSpy = spyOn(useStatsModule, "useStorePriceComparisons").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStatsModule.useStorePriceComparisons>);
  });

  afterEach(() => {
    shoppingListSpy.mockRestore();
    itemsSpy.mockRestore();
    categoriesSpy.mockRestore();
    userSettingsSpy.mockRestore();
    templatesSpy.mockRestore();
    forecastAlertsSpy.mockRestore();
    storePriceComparisonsSpy.mockRestore();
    localStorage.removeItem("shopping.mode");
    cleanup();
  });

  it("通常モードで買い物リストの取得に失敗した場合、空リストではなくエラーカードを表示する", () => {
    localStorage.removeItem("shopping.mode");
    shoppingListSpy.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      refetch: refetchShoppingList,
    } as unknown as ReturnType<typeof useShoppingListModule.useShoppingList>);

    const { getByText, queryByText } = renderPage();

    expect(queryByText(i18n.t("shopping:noItems"))).toBeNull();
    expect(getByText(i18n.t("common:unknownError"))).toBeDefined();

    fireEvent.click(getByText(i18n.t("common:retry")));
    expect(refetchShoppingList).toHaveBeenCalled();
  });

  it("買い物中モードで在庫アイテムの取得に失敗した場合、「確認することはありません」ではなくエラーカードを表示する", () => {
    localStorage.setItem("shopping.mode", "1");
    itemsSpy.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      refetch: refetchItems,
    } as unknown as ReturnType<typeof useItemsModule.useItems>);

    const { getByText, queryByText } = renderPage();

    expect(
      queryByText(/shoppingModeAllClear|買い物中に確認することはありません|Nothing to check/),
    ).toBeNull();
    expect(getByText(i18n.t("common:unknownError"))).toBeDefined();

    fireEvent.click(getByText(i18n.t("common:retry")));
    expect(refetchItems).toHaveBeenCalled();
  });
});

describe("ShoppingPage - 「カートに入れた」チェック状態のクリア (#983)", () => {
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

  const CART_CHECK_STORAGE_KEY = "shopping.cartCheckedIds";
  let shoppingListSpy: ReturnType<typeof spyOn>;
  let itemsSpy: ReturnType<typeof spyOn>;
  let categoriesSpy: ReturnType<typeof spyOn>;
  let userSettingsSpy: ReturnType<typeof spyOn>;
  let templatesSpy: ReturnType<typeof spyOn>;
  let forecastAlertsSpy: ReturnType<typeof spyOn>;
  let storePriceComparisonsSpy: ReturnType<typeof spyOn>;
  let deleteItemSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    window.localStorage.setItem(CART_CHECK_STORAGE_KEY, JSON.stringify({ s1: true }));

    shoppingListSpy = spyOn(useShoppingListModule, "useShoppingList").mockImplementation(
      (tab: unknown) =>
        ({
          data: tab === "planned" ? [plannedItem] : [],
          isLoading: false,
        }) as ReturnType<typeof useShoppingListModule.useShoppingList>,
    );

    itemsSpy = spyOn(useItemsModule, "useItems").mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItems>);

    categoriesSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useMasterDataModule.useCategories>);

    userSettingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);

    templatesSpy = spyOn(useShoppingTemplatesModule, "useShoppingTemplates").mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useShoppingTemplatesModule.useShoppingTemplates>);

    forecastAlertsSpy = spyOn(useStatsModule, "useForecastAlerts").mockReturnValue({
      alerts: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStatsModule.useForecastAlerts>);

    storePriceComparisonsSpy = spyOn(useStatsModule, "useStorePriceComparisons").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStatsModule.useStorePriceComparisons>);

    deleteItemSpy = spyOn(useShoppingListModule, "useDeleteShoppingItem").mockReturnValue({
      mutateAsync: mock(async () => {}),
      isPending: false,
    } as ReturnType<typeof useShoppingListModule.useDeleteShoppingItem>);
  });

  afterEach(() => {
    shoppingListSpy.mockRestore();
    itemsSpy.mockRestore();
    categoriesSpy.mockRestore();
    userSettingsSpy.mockRestore();
    templatesSpy.mockRestore();
    forecastAlertsSpy.mockRestore();
    storePriceComparisonsSpy.mockRestore();
    deleteItemSpy.mockRestore();
    window.localStorage.removeItem(CART_CHECK_STORAGE_KEY);
    cleanup();
  });

  it("アイテムを削除すると、そのアイテムの「カートに入れた」チェック状態も消える", async () => {
    const { getByRole, findByRole } = renderPage();

    fireEvent.click(getByRole("button", { name: /削除|delete/i }));
    const dialog = await findByRole("alertdialog");

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /^削除$|^delete$/i }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const stored: unknown = JSON.parse(window.localStorage.getItem(CART_CHECK_STORAGE_KEY) ?? "{}");
    expect(stored).toEqual({});
  });
});

describe("ShoppingPage - 買い物中モードのオフライン耐性強化 (#981)", () => {
  const OFFLINE_QUEUE_STORAGE_KEY = "shopping.offlineActionQueue";
  const lowStockItem = {
    id: "item-1",
    user_id: "u1",
    name: "醤油",
    units: 0,
    content_amount: 1,
    content_unit: "本",
    minimum_stock: 1,
  };

  let shoppingListSpy: ReturnType<typeof spyOn>;
  let itemsSpy: ReturnType<typeof spyOn>;
  let categoriesSpy: ReturnType<typeof spyOn>;
  let userSettingsSpy: ReturnType<typeof spyOn>;
  let templatesSpy: ReturnType<typeof spyOn>;
  let forecastAlertsSpy: ReturnType<typeof spyOn>;
  let storePriceComparisonsSpy: ReturnType<typeof spyOn>;
  let upsertSpy: ReturnType<typeof spyOn>;
  let purchaseSpy: ReturnType<typeof spyOn>;
  let upsertMutateAsync: ReturnType<typeof mock>;
  let toastCalls: { message: string; variant?: ToastVariant; options?: ToastOptions }[];
  let originalOnLine: boolean;

  const setOnline = (value: boolean) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value });
  };

  const OfflineQueueWrapper = ({ children }: { children: React.ReactNode }) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const toast = mock((message: string, variant?: ToastVariant, options?: ToastOptions) => {
      toastCalls.push({ message, variant, options });
      return `toast-${toastCalls.length}`;
    });
    const value: ToastContextValue = { toasts: [], toast, dismiss: () => {} };
    return (
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
        </I18nextProvider>
      </QueryClientProvider>
    );
  };

  const renderOfflineQueuePage = () =>
    render(<ShoppingPage />, { wrapper: OfflineQueueWrapper as React.ComponentType });

  beforeEach(() => {
    originalOnLine = navigator.onLine;
    toastCalls = [];
    localStorage.setItem("shopping.mode", "1");
    window.localStorage.removeItem(OFFLINE_QUEUE_STORAGE_KEY);

    shoppingListSpy = spyOn(useShoppingListModule, "useShoppingList").mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useShoppingListModule.useShoppingList>);

    itemsSpy = spyOn(useItemsModule, "useItems").mockReturnValue({
      data: [lowStockItem],
      isLoading: false,
    } as unknown as ReturnType<typeof useItemsModule.useItems>);

    categoriesSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useMasterDataModule.useCategories>);

    userSettingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);

    templatesSpy = spyOn(useShoppingTemplatesModule, "useShoppingTemplates").mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useShoppingTemplatesModule.useShoppingTemplates>);

    forecastAlertsSpy = spyOn(useStatsModule, "useForecastAlerts").mockReturnValue({
      alerts: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStatsModule.useForecastAlerts>);

    storePriceComparisonsSpy = spyOn(useStatsModule, "useStorePriceComparisons").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStatsModule.useStorePriceComparisons>);

    upsertMutateAsync = mock(async () => ({ id: "shopping-new" }));
    upsertSpy = spyOn(useShoppingListModule, "useUpsertShoppingItem").mockReturnValue({
      mutateAsync: upsertMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useShoppingListModule.useUpsertShoppingItem>);

    purchaseSpy = spyOn(useShoppingListModule, "usePurchaseShoppingItem").mockReturnValue({
      mutateAsync: mock(async () => ({ id: "created-item" })),
      isPending: false,
    } as unknown as ReturnType<typeof useShoppingListModule.usePurchaseShoppingItem>);
  });

  afterEach(() => {
    setOnline(originalOnLine);
    shoppingListSpy.mockRestore();
    itemsSpy.mockRestore();
    categoriesSpy.mockRestore();
    userSettingsSpy.mockRestore();
    templatesSpy.mockRestore();
    forecastAlertsSpy.mockRestore();
    storePriceComparisonsSpy.mockRestore();
    upsertSpy.mockRestore();
    purchaseSpy.mockRestore();
    localStorage.removeItem("shopping.mode");
    window.localStorage.removeItem(OFFLINE_QUEUE_STORAGE_KEY);
    cleanup();
  });

  it("オフライン時にアラートから「リストに追加」すると、実際の追加は呼ばずキューに積んでその旨のトーストを出す", async () => {
    setOnline(false);
    const { getByRole } = renderOfflineQueuePage();

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /リストに追加|Add to list/i }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(upsertMutateAsync).not.toHaveBeenCalled();
    expect(readOfflineActionQueue()).toHaveLength(1);
    expect(
      toastCalls.some((c) => c.message.includes("キューに積みました") || /queued/i.test(c.message)),
    ).toBe(true);
  });

  it("オンライン時にアラートから「リストに追加」すると、通常通り実際に追加され成功トーストを出す", async () => {
    setOnline(true);
    const { getByRole } = renderOfflineQueuePage();

    await act(async () => {
      fireEvent.click(getByRole("button", { name: /リストに追加|Add to list/i }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(upsertMutateAsync).toHaveBeenCalledWith({ name: "醤油", linked_item_id: "item-1" });
    expect(readOfflineActionQueue()).toHaveLength(0);
  });
});

describe("ShoppingPage - オフラインキュー経由の購入確定で画像が消失する不具合の修正 (#1020)", () => {
  const OFFLINE_QUEUE_STORAGE_KEY = "shopping.offlineActionQueue";
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

  let shoppingListSpy: ReturnType<typeof spyOn>;
  let itemsSpy: ReturnType<typeof spyOn>;
  let categoriesSpy: ReturnType<typeof spyOn>;
  let userSettingsSpy: ReturnType<typeof spyOn>;
  let templatesSpy: ReturnType<typeof spyOn>;
  let forecastAlertsSpy: ReturnType<typeof spyOn>;
  let storePriceComparisonsSpy: ReturnType<typeof spyOn>;
  let purchaseSpy: ReturnType<typeof spyOn>;
  let itemFormSpy: ReturnType<typeof spyOn>;
  let uploadItemImageSpy: ReturnType<typeof spyOn>;
  let purchaseMutateAsync: ReturnType<typeof mock>;
  let toastCalls: { message: string; variant?: ToastVariant; options?: ToastOptions }[];
  let originalOnLine: boolean;

  const setOnline = (value: boolean) => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value });
  };

  const Wrapper = ({ children }: { children: React.ReactNode }) => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const toast = mock((message: string, variant?: ToastVariant, options?: ToastOptions) => {
      toastCalls.push({ message, variant, options });
      return `toast-${toastCalls.length}`;
    });
    const value: ToastContextValue = { toasts: [], toast, dismiss: () => {} };
    return (
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
        </I18nextProvider>
      </QueryClientProvider>
    );
  };

  const renderPage = () => render(<ShoppingPage />, { wrapper: Wrapper as React.ComponentType });

  beforeEach(() => {
    originalOnLine = navigator.onLine;
    toastCalls = [];
    localStorage.setItem("shopping.mode", "1");
    window.localStorage.removeItem(OFFLINE_QUEUE_STORAGE_KEY);

    shoppingListSpy = spyOn(useShoppingListModule, "useShoppingList").mockImplementation(
      (tab: unknown) =>
        ({
          data: tab === "planned" ? [plannedItem] : [],
          isLoading: false,
        }) as ReturnType<typeof useShoppingListModule.useShoppingList>,
    );

    itemsSpy = spyOn(useItemsModule, "useItems").mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItems>);

    categoriesSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useMasterDataModule.useCategories>);

    userSettingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);

    templatesSpy = spyOn(useShoppingTemplatesModule, "useShoppingTemplates").mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof useShoppingTemplatesModule.useShoppingTemplates>);

    forecastAlertsSpy = spyOn(useStatsModule, "useForecastAlerts").mockReturnValue({
      alerts: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStatsModule.useForecastAlerts>);

    storePriceComparisonsSpy = spyOn(useStatsModule, "useStorePriceComparisons").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useStatsModule.useStorePriceComparisons>);

    purchaseMutateAsync = mock(async () => ({ id: "created-item" }));
    purchaseSpy = spyOn(useShoppingListModule, "usePurchaseShoppingItem").mockReturnValue({
      mutateAsync: purchaseMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useShoppingListModule.usePurchaseShoppingItem>);

    itemFormSpy = spyOn(ItemFormModule, "ItemForm").mockImplementation(
      StubItemFormForPurchase as unknown as typeof ItemFormModule.ItemForm,
    );

    uploadItemImageSpy = spyOn(useItemImageModule, "uploadItemImage").mockResolvedValue(
      "u1/created-item.jpg",
    );
  });

  afterEach(() => {
    setOnline(originalOnLine);
    shoppingListSpy.mockRestore();
    itemsSpy.mockRestore();
    categoriesSpy.mockRestore();
    userSettingsSpy.mockRestore();
    templatesSpy.mockRestore();
    forecastAlertsSpy.mockRestore();
    storePriceComparisonsSpy.mockRestore();
    purchaseSpy.mockRestore();
    itemFormSpy.mockRestore();
    uploadItemImageSpy.mockRestore();
    localStorage.removeItem("shopping.mode");
    window.localStorage.removeItem(OFFLINE_QUEUE_STORAGE_KEY);
    cleanup();
  });

  it("オフラインで画像付き購入確定→再接続後のリプレイでその画像がアップロードされる", async () => {
    setOnline(false);
    const { getByRole, findByRole } = renderPage();

    fireEvent.click(getByRole("button", { name: /在庫に追加|add to inventory/i }));
    const dialog = await findByRole("dialog");

    fireEvent.click(within(dialog).getByTestId("select-pending-file"));

    fireEvent.click(within(dialog).getByTestId("submit-purchase-form"));

    // #1020: 画像のIndexedDB保存は実際の非同期ラウンドトリップを伴うため、
    // 1tickの待ち合わせでは終わらないことがある — waitForで確実に待つ。
    await waitFor(() => {
      expect(readOfflineActionQueue()).toHaveLength(1);
    });
    // オフライン時は実際の購入確定を呼ばず、キューに積むだけ
    expect(purchaseMutateAsync).not.toHaveBeenCalled();
    expect(uploadItemImageSpy).not.toHaveBeenCalled();
    expect(toastCalls.some((c) => c.message === i18n.t("shopping:offlineQueuedPurchase"))).toBe(
      true,
    );

    // 再接続 → リプレイが購入確定を実行し、保存しておいた画像をアップロードする
    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(purchaseMutateAsync).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(uploadItemImageSpy).toHaveBeenCalledTimes(1);
    });
    const uploadCall = uploadItemImageSpy.mock.calls[0]?.[0] as { itemId: string; file: File };
    expect(uploadCall.itemId).toBe("created-item");
    expect(uploadCall.file).toBeInstanceOf(File);
    expect(uploadCall.file.name).toBe("photo.jpg");
    expect(await uploadCall.file.text()).toBe("x");
    expect(readOfflineActionQueue()).toHaveLength(0);
  });

  it("オフラインで画像を選択せずに購入確定した場合、再接続後もuploadItemImageは呼ばれない", async () => {
    setOnline(false);
    const { getByRole, findByRole } = renderPage();

    fireEvent.click(getByRole("button", { name: /在庫に追加|add to inventory/i }));
    const dialog = await findByRole("dialog");

    fireEvent.click(within(dialog).getByTestId("submit-purchase-form"));

    await waitFor(() => {
      expect(readOfflineActionQueue()).toHaveLength(1);
    });

    setOnline(true);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(purchaseMutateAsync).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(readOfflineActionQueue()).toHaveLength(0);
    });
    expect(uploadItemImageSpy).not.toHaveBeenCalled();
  });
});
