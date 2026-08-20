import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as useMasterDataModule from "@/hooks/useMasterData";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

// Import routerContext via relative path (not in public package exports) to provide
// a minimal router stub so that useNavigate inside LocationsPage doesn't throw.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { LocationsPage } from "./_auth.settings.locations";

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

const renderPage = () => render(<LocationsPage />, { wrapper: Wrapper as React.ComponentType });

describe("LocationsPage — アイコンのみボタンのaria-label (#862)", () => {
  let locationsSpy: ReturnType<typeof spyOn>;
  let usageCountsSpy: ReturnType<typeof spyOn>;
  let createSpy: ReturnType<typeof spyOn>;
  let updateSpy: ReturnType<typeof spyOn>;
  let deleteSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    locationsSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    usageCountsSpy = spyOn(useMasterDataModule, "useStorageLocationUsageCounts").mockReturnValue({
      data: {},
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocationUsageCounts>);
    createSpy = spyOn(useMasterDataModule, "useCreateStorageLocation").mockReturnValue({
      mutateAsync: mock(async () => ({ id: "loc-1", name: "" })),
      isPending: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCreateStorageLocation>);
    updateSpy = spyOn(useMasterDataModule, "useUpdateStorageLocation").mockReturnValue({
      mutateAsync: mock(async () => {}),
      isPending: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useUpdateStorageLocation>);
    deleteSpy = spyOn(useMasterDataModule, "useDeleteStorageLocation").mockReturnValue({
      mutateAsync: mock(async () => {}),
      isPending: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useDeleteStorageLocation>);
  });

  afterEach(() => {
    locationsSpy.mockRestore();
    usageCountsSpy.mockRestore();
    createSpy.mockRestore();
    updateSpy.mockRestore();
    deleteSpy.mockRestore();
    cleanup();
  });

  it("戻るボタン・追加ボタンにaria-labelが付与されている", () => {
    const { getByRole } = renderPage();
    expect(getByRole("button", { name: /^back$|戻る|^Back$/i })).toBeDefined();
    expect(getByRole("button", { name: /^add$|追加|^Add$/i })).toBeDefined();
  });
});

describe("LocationsPage — 削除ボタンの使用中バッジ・disabled事前表示 (#863)", () => {
  let locationsSpy: ReturnType<typeof spyOn>;
  let usageCountsSpy: ReturnType<typeof spyOn>;
  let createSpy: ReturnType<typeof spyOn>;
  let updateSpy: ReturnType<typeof spyOn>;
  let deleteSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    createSpy = spyOn(useMasterDataModule, "useCreateStorageLocation").mockReturnValue({
      mutateAsync: mock(async () => ({ id: "loc-1", name: "" })),
      isPending: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCreateStorageLocation>);
    updateSpy = spyOn(useMasterDataModule, "useUpdateStorageLocation").mockReturnValue({
      mutateAsync: mock(async () => {}),
      isPending: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useUpdateStorageLocation>);
    deleteSpy = spyOn(useMasterDataModule, "useDeleteStorageLocation").mockReturnValue({
      mutateAsync: mock(async () => {}),
      isPending: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useDeleteStorageLocation>);
  });

  afterEach(() => {
    locationsSpy.mockRestore();
    usageCountsSpy.mockRestore();
    createSpy.mockRestore();
    updateSpy.mockRestore();
    deleteSpy.mockRestore();
    cleanup();
  });

  it("使用中件数が0件の保管場所では、バッジは出ず削除ボタンは有効", () => {
    locationsSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [{ id: "loc-1", name: "冷蔵庫", icon: null }],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    usageCountsSpy = spyOn(useMasterDataModule, "useStorageLocationUsageCounts").mockReturnValue({
      data: {},
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocationUsageCounts>);

    const { getByRole, queryByText } = renderPage();
    expect(queryByText(/使用中|used by/i)).toBeNull();
    const deleteButton = getByRole("button", { name: /^delete$|削除|^Delete$/i });
    expect(deleteButton.hasAttribute("disabled")).toBe(false);
  });

  it("使用中件数が1件以上の保管場所では、バッジが表示され削除ボタンがdisabledになる", () => {
    locationsSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [{ id: "loc-1", name: "冷蔵庫", icon: null }],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    usageCountsSpy = spyOn(useMasterDataModule, "useStorageLocationUsageCounts").mockReturnValue({
      data: { "loc-1": 2 },
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocationUsageCounts>);

    // No I18nextProvider in this test file's Wrapper, so t() falls back to
    // returning the raw key instead of interpolating {{count}}.
    const { getByRole, getByText } = renderPage();
    expect(getByText(/usedByCount|使用中|used by/i)).toBeDefined();
    const deleteButton = getByRole("button", { name: /^delete$|削除|^Delete$/i });
    expect(deleteButton.hasAttribute("disabled")).toBe(true);
    expect(deleteButton.getAttribute("title")).not.toBeNull();
  });
});
