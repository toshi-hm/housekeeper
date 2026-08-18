import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as useConsumptionLogsModule from "@/hooks/useConsumptionLogs";
import * as useItemImageModule from "@/hooks/useItemImage";
import * as useItemLotsModule from "@/hooks/useItemLots";
import * as useItemsModule from "@/hooks/useItems";
import * as useMasterDataModule from "@/hooks/useMasterData";
import * as useShoppingListModule from "@/hooks/useShoppingList";
import * as useTagsModule from "@/hooks/useTags";
import * as useUserSettingsModule from "@/hooks/useUserSettings";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

// Import routerContext via relative path (not in public package exports) to provide
// a minimal router stub so that useNavigate/useRouterState inside ItemDetailPage
// don't throw.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { ItemDetailPage, Route } from "./_auth.items.$itemId";

const routerState = {
  status: "idle" as const,
  isFetching: false,
  matches: [] as unknown[],
  pendingMatches: [] as unknown[],
  cachedMatches: [] as unknown[],
  location: { href: "/", pathname: "/", search: {}, searchStr: "", hash: "", state: {} },
  resolvedLocation: { href: "/", pathname: "/", search: {}, searchStr: "", hash: "", state: {} },
};

const makeStubStore = <T,>(value: T) => ({
  get: () => value,
  subscribe: () => ({ unsubscribe: () => {} }),
});

const stubRouter = {
  navigate: () => Promise.resolve(),
  buildLocation: () => ({ href: "/" }),
  isServer: false,
  options: {},
  state: routerState,
  stores: { __store: makeStubStore(routerState) },
} as unknown as Parameters<typeof routerContext.Provider>[0]["value"];

const stubToast: ToastContextValue = { toasts: [], toast: () => "toast-id", dismiss: () => {} };

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <routerContext.Provider value={stubRouter}>
        <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
      </routerContext.Provider>
    </QueryClientProvider>
  );
};

const renderPage = () => render(<ItemDetailPage />, { wrapper: Wrapper as React.ComponentType });

describe("ItemDetailPage — 存在しないアイテムのエラー画面 (#862)", () => {
  let spies: ReturnType<typeof spyOn>[];

  beforeEach(() => {
    spies = [
      spyOn(Route, "useParams").mockReturnValue({
        itemId: "missing-item-id",
      } as ReturnType<typeof Route.useParams>),
      spyOn(Route, "useSearch").mockReturnValue({
        tab: "info",
      } as ReturnType<typeof Route.useSearch>),
      spyOn(useItemsModule, "useItem").mockReturnValue({
        data: undefined,
        isLoading: false,
        error: null,
      } as unknown as ReturnType<typeof useItemsModule.useItem>),
      spyOn(useItemsModule, "useSoftDeleteItem").mockReturnValue({
        mutateAsync: mock(async () => {}),
        isPending: false,
      } as unknown as ReturnType<typeof useItemsModule.useSoftDeleteItem>),
      spyOn(useItemsModule, "useVerifyItem").mockReturnValue({
        mutateAsync: mock(async () => {}),
        isPending: false,
      } as unknown as ReturnType<typeof useItemsModule.useVerifyItem>),
      spyOn(useItemLotsModule, "useItemLots").mockReturnValue({
        data: [],
        isLoading: false,
      } as unknown as ReturnType<typeof useItemLotsModule.useItemLots>),
      spyOn(useMasterDataModule, "useCategories").mockReturnValue({
        data: [],
        isLoading: false,
      } as unknown as ReturnType<typeof useMasterDataModule.useCategories>),
      spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
        data: [],
        isLoading: false,
      } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocations>),
      spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
        data: undefined,
        isLoading: false,
      } as unknown as ReturnType<typeof useUserSettingsModule.useUserSettings>),
      spyOn(useShoppingListModule, "useUpsertShoppingItem").mockReturnValue({
        mutateAsync: mock(async () => {}),
        isPending: false,
      } as unknown as ReturnType<typeof useShoppingListModule.useUpsertShoppingItem>),
      spyOn(useConsumptionLogsModule, "useConsumptionLogs").mockReturnValue({
        data: [],
        isLoading: false,
      } as unknown as ReturnType<typeof useConsumptionLogsModule.useConsumptionLogs>),
      spyOn(useItemImageModule, "useSignedItemImage").mockReturnValue({
        data: undefined,
        isLoading: false,
      } as unknown as ReturnType<typeof useItemImageModule.useSignedItemImage>),
      spyOn(useTagsModule, "useTags").mockReturnValue({
        data: [],
        isLoading: false,
      } as unknown as ReturnType<typeof useTagsModule.useTags>),
      spyOn(useTagsModule, "useItemTagIds").mockReturnValue({
        data: [],
        isLoading: false,
      } as unknown as ReturnType<typeof useTagsModule.useItemTagIds>),
    ];
  });

  afterEach(() => {
    spies.forEach((s) => s.mockRestore());
    cleanup();
  });

  it("アイテムが見つからない画面の戻るボタンにaria-labelが付与されている", () => {
    const { getByRole } = renderPage();
    expect(getByRole("button", { name: /^back$|戻る|^Back$/i })).toBeDefined();
  });
});
