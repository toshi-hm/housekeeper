import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import * as useTagsModule from "@/hooks/useTags";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

// Import routerContext via relative path (not in public package exports) to provide
// a minimal router stub so that useNavigate inside TagsPage doesn't throw.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { TagsPage } from "./_auth.settings.tags";

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

const renderPage = () => render(<TagsPage />, { wrapper: Wrapper as React.ComponentType });

describe("TagsPage — アイコンのみボタンのaria-label (#862)", () => {
  let tagsSpy: ReturnType<typeof spyOn>;
  let usageCountsSpy: ReturnType<typeof spyOn>;
  let createSpy: ReturnType<typeof spyOn>;
  let updateSpy: ReturnType<typeof spyOn>;
  let deleteSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tagsSpy = spyOn(useTagsModule, "useTags").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useTagsModule.useTags>);
    usageCountsSpy = spyOn(useTagsModule, "useTagUsageCounts").mockReturnValue({
      data: {},
      isLoading: false,
    } as unknown as ReturnType<typeof useTagsModule.useTagUsageCounts>);
    createSpy = spyOn(useTagsModule, "useCreateTag").mockReturnValue({
      mutateAsync: mock(async () => ({ id: "tag-1", name: "" })),
      isPending: false,
    } as unknown as ReturnType<typeof useTagsModule.useCreateTag>);
    updateSpy = spyOn(useTagsModule, "useUpdateTag").mockReturnValue({
      mutateAsync: mock(async () => {}),
      isPending: false,
    } as unknown as ReturnType<typeof useTagsModule.useUpdateTag>);
    deleteSpy = spyOn(useTagsModule, "useDeleteTag").mockReturnValue({
      mutateAsync: mock(async () => {}),
      isPending: false,
    } as unknown as ReturnType<typeof useTagsModule.useDeleteTag>);
  });

  afterEach(() => {
    tagsSpy.mockRestore();
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

// This test file renders without an I18nextProvider (see Wrapper above), so t()
// falls back to returning the raw key instead of interpolating {{count}} — assert
// on the raw key text rather than the rendered translation (see categories/locations
// equivalent test files for the same convention).
describe("TagsPage — 使用中バッジ・削除確認ダイアログの件数表示 (#1040)", () => {
  let tagsSpy: ReturnType<typeof spyOn>;
  let usageCountsSpy: ReturnType<typeof spyOn>;
  let createSpy: ReturnType<typeof spyOn>;
  let updateSpy: ReturnType<typeof spyOn>;
  let deleteSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    tagsSpy = spyOn(useTagsModule, "useTags").mockReturnValue({
      data: [{ id: "tag-1", name: "冷蔵", color: null }],
      isLoading: false,
    } as unknown as ReturnType<typeof useTagsModule.useTags>);
    createSpy = spyOn(useTagsModule, "useCreateTag").mockReturnValue({
      mutateAsync: mock(async () => ({ id: "tag-1", name: "" })),
      isPending: false,
    } as unknown as ReturnType<typeof useTagsModule.useCreateTag>);
    updateSpy = spyOn(useTagsModule, "useUpdateTag").mockReturnValue({
      mutateAsync: mock(async () => {}),
      isPending: false,
    } as unknown as ReturnType<typeof useTagsModule.useUpdateTag>);
    deleteSpy = spyOn(useTagsModule, "useDeleteTag").mockReturnValue({
      mutateAsync: mock(async () => {}),
      isPending: false,
    } as unknown as ReturnType<typeof useTagsModule.useDeleteTag>);
  });

  afterEach(() => {
    tagsSpy.mockRestore();
    usageCountsSpy.mockRestore();
    createSpy.mockRestore();
    updateSpy.mockRestore();
    deleteSpy.mockRestore();
    cleanup();
  });

  // Depending on test run order, the shared i18n instance may or may not be
  // initialised by another file (see comment above), so match either the raw
  // key or the ja/en translated copy — not a fixed string.
  const NO_COUNT_MESSAGE =
    /^deleteTagConfirm$|すべてのアイテムから外れます|removed from all items/i;
  const WITH_COUNT_MESSAGE =
    /deleteTagConfirmWithCount|3\s*件のアイテムから外れます|removed from 3 items?/i;

  it("使用件数が0件のタグでは、バッジが出ず削除確認は件数なしの文言になる", () => {
    usageCountsSpy = spyOn(useTagsModule, "useTagUsageCounts").mockReturnValue({
      data: {},
      isLoading: false,
    } as unknown as ReturnType<typeof useTagsModule.useTagUsageCounts>);

    const { getByRole, queryByText, getByText } = renderPage();
    expect(queryByText(/usedByCount|使用中|used by/i)).toBeNull();

    fireEvent.click(getByRole("button", { name: /^delete$|削除|^Delete$/i }));
    expect(getByText(NO_COUNT_MESSAGE)).toBeDefined();
    expect(queryByText(WITH_COUNT_MESSAGE)).toBeNull();
  });

  it("使用件数が1件以上のタグでは、バッジが表示され削除確認に件数入りの文言が出る", () => {
    usageCountsSpy = spyOn(useTagsModule, "useTagUsageCounts").mockReturnValue({
      data: { "tag-1": 3 },
      isLoading: false,
    } as unknown as ReturnType<typeof useTagsModule.useTagUsageCounts>);

    const { getByRole, queryByText, getByText } = renderPage();
    expect(getByText(/usedByCount|使用中|used by/i)).toBeDefined();

    fireEvent.click(getByRole("button", { name: /^delete$|削除|^Delete$/i }));
    expect(getByText(WITH_COUNT_MESSAGE)).toBeDefined();
    expect(queryByText(NO_COUNT_MESSAGE)).toBeNull();
  });
});
