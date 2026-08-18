import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as usePurchaseHistoryModule from "@/hooks/usePurchaseHistory";
import * as useShoppingListModule from "@/hooks/useShoppingList";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";
import type { ArchivedShoppingItem } from "@/types/shopping";

// Import routerContext via relative path (not in public package exports) to provide
// a minimal router stub so that useNavigate inside PurchaseHistoryPage doesn't throw.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { PurchaseHistoryPage } from "./_auth.settings.purchase-history";

const stubRouter = {
  navigate: () => Promise.resolve(),
  buildLocation: () => ({ href: "/" }),
  isServer: false,
  options: {},
  state: { location: { href: "/", pathname: "/" }, matches: [], pendingMatches: [] },
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

const baseItem: ArchivedShoppingItem = {
  id: "archived-1",
  user_id: "test-user-id",
  name: "牛乳",
  desired_units: 1,
  note: null,
  archived_at: "2026-01-01T00:00:00Z",
};

// Regexes tolerate whichever i18n state (raw key / ja / en) happens to be
// active when this file runs in the shared bun test process (see #772).
const EMPTY_TEXT = /purchaseHistoryEmpty|No purchase history yet|購入履歴はまだありません/;
const ERROR_TEXT = /unknownError|An error occurred|エラーが発生しました/;
const RETRY_TEXT = /^(retry|Retry|再試行)$/;

const renderPage = () =>
  render(<PurchaseHistoryPage />, { wrapper: Wrapper as React.ComponentType });

describe("PurchaseHistoryPage", () => {
  let purchaseHistorySpy: ReturnType<typeof spyOn>;
  let upsertSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    purchaseHistorySpy = spyOn(usePurchaseHistoryModule, "usePurchaseHistory").mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof usePurchaseHistoryModule.usePurchaseHistory>);

    upsertSpy = spyOn(useShoppingListModule, "useUpsertShoppingItem").mockReturnValue({
      mutateAsync: mock(async () => {}),
      isPending: false,
    } as unknown as ReturnType<typeof useShoppingListModule.useUpsertShoppingItem>);
  });

  afterEach(() => {
    purchaseHistorySpy.mockRestore();
    upsertSpy.mockRestore();
    cleanup();
  });

  it("戻るボタンにaria-labelが付与されている(#862)", () => {
    const { getByRole } = renderPage();
    expect(getByRole("button", { name: /^back$|戻る|^Back$/i })).toBeDefined();
  });

  it("shows the empty message when the query succeeds with no history (#783: not the error state)", () => {
    const { getByText, queryByText } = renderPage();
    expect(getByText(EMPTY_TEXT)).toBeDefined();
    expect(queryByText(ERROR_TEXT)).toBeNull();
  });

  it("shows an error message and retry button instead of the empty state when the query fails (#783)", () => {
    purchaseHistorySpy.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      refetch: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof usePurchaseHistoryModule.usePurchaseHistory>);

    const { getByText, queryByText } = renderPage();
    expect(getByText(ERROR_TEXT)).toBeDefined();
    expect(getByText(RETRY_TEXT)).toBeDefined();
    // The misleading "no history yet" empty message must not be shown on error.
    expect(queryByText(EMPTY_TEXT)).toBeNull();
  });

  it("calls refetch when the retry button is clicked (#783)", () => {
    const refetch = mock(() => Promise.resolve());
    purchaseHistorySpy.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      refetch,
    } as unknown as ReturnType<typeof usePurchaseHistoryModule.usePurchaseHistory>);

    const { getByText } = renderPage();
    getByText(RETRY_TEXT).click();

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("renders history rows when the query succeeds with data", () => {
    purchaseHistorySpy.mockReturnValue({
      data: [baseItem],
      isLoading: false,
      isError: false,
      refetch: mock(() => Promise.resolve()),
    } as unknown as ReturnType<typeof usePurchaseHistoryModule.usePurchaseHistory>);

    const { getByText, queryByText } = renderPage();
    expect(getByText("牛乳")).toBeDefined();
    expect(queryByText(ERROR_TEXT)).toBeNull();
    expect(queryByText(EMPTY_TEXT)).toBeNull();
  });
});
