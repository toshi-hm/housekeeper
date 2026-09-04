import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { I18nextProvider } from "react-i18next";

import * as useItemsModule from "@/hooks/useItems";
import * as useMasterDataModule from "@/hooks/useMasterData";
import * as useShoppingListModule from "@/hooks/useShoppingList";
import * as useShoppingTemplatesModule from "@/hooks/useShoppingTemplates";
import * as useStatsModule from "@/hooks/useStats";
import * as useUserSettingsModule from "@/hooks/useUserSettings";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

import { ShoppingPage } from "./_auth.shopping";

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
