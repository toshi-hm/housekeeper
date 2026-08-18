import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as useMasterDataModule from "@/hooks/useMasterData";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

// Import routerContext via relative path (not in public package exports) to provide
// a minimal router stub so that useNavigate inside CategoriesPage doesn't throw.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { CategoriesPage } from "./_auth.settings.categories";

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

const renderPage = () => render(<CategoriesPage />, { wrapper: Wrapper as React.ComponentType });

describe("CategoriesPage — アイコンのみボタンのaria-label (#862)", () => {
  let categoriesSpy: ReturnType<typeof spyOn>;
  let createSpy: ReturnType<typeof spyOn>;
  let updateSpy: ReturnType<typeof spyOn>;
  let deleteSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    categoriesSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
    createSpy = spyOn(useMasterDataModule, "useCreateCategory").mockReturnValue({
      mutateAsync: mock(async () => ({ id: "cat-1", name: "" })),
      isPending: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCreateCategory>);
    updateSpy = spyOn(useMasterDataModule, "useUpdateCategory").mockReturnValue({
      mutateAsync: mock(async () => {}),
      isPending: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useUpdateCategory>);
    deleteSpy = spyOn(useMasterDataModule, "useDeleteCategory").mockReturnValue({
      mutateAsync: mock(async () => {}),
      isPending: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useDeleteCategory>);
  });

  afterEach(() => {
    categoriesSpy.mockRestore();
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
