import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  let usageCountsSpy: ReturnType<typeof spyOn>;
  let createSpy: ReturnType<typeof spyOn>;
  let updateSpy: ReturnType<typeof spyOn>;
  let deleteSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    categoriesSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
    usageCountsSpy = spyOn(useMasterDataModule, "useCategoryUsageCounts").mockReturnValue({
      data: {},
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategoryUsageCounts>);
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

describe("CategoriesPage — 削除ボタンの使用中バッジ・disabled事前表示 (#863)", () => {
  let categoriesSpy: ReturnType<typeof spyOn>;
  let usageCountsSpy: ReturnType<typeof spyOn>;
  let createSpy: ReturnType<typeof spyOn>;
  let updateSpy: ReturnType<typeof spyOn>;
  let deleteSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
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
    usageCountsSpy.mockRestore();
    createSpy.mockRestore();
    updateSpy.mockRestore();
    deleteSpy.mockRestore();
    cleanup();
  });

  it("使用中件数が0件のカテゴリでは、バッジは出ず削除ボタンは有効", () => {
    categoriesSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [{ id: "cat-1", name: "冷蔵庫", color: null, icon: null }],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
    usageCountsSpy = spyOn(useMasterDataModule, "useCategoryUsageCounts").mockReturnValue({
      data: {},
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategoryUsageCounts>);

    const { getByRole, queryByText } = renderPage();
    expect(queryByText(/使用中|used by/i)).toBeNull();
    const deleteButton = getByRole("button", { name: /^delete$|削除|^Delete$/i });
    expect(deleteButton.hasAttribute("disabled")).toBe(false);
  });

  it("使用中件数が1件以上のカテゴリでは、バッジが表示され削除ボタンがdisabledになる", () => {
    categoriesSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [{ id: "cat-1", name: "冷蔵庫", color: null, icon: null }],
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
    usageCountsSpy = spyOn(useMasterDataModule, "useCategoryUsageCounts").mockReturnValue({
      data: { "cat-1": 3 },
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategoryUsageCounts>);

    // This test file renders without an I18nextProvider (see Wrapper above),
    // so t() falls back to returning the raw key instead of interpolating
    // {{count}} — assert on the badge's presence/key rather than "3".
    const { getByRole, getByText } = renderPage();
    expect(getByText(/usedByCount|使用中|used by/i)).toBeDefined();
    const deleteButton = getByRole("button", { name: /^delete$|削除|^Delete$/i });
    expect(deleteButton.hasAttribute("disabled")).toBe(true);
    expect(deleteButton.getAttribute("title")).not.toBeNull();
  });
});

// This test file renders without an I18nextProvider (see Wrapper above). Whether
// t() resolves depends on whether another test file in the same `bun test` run has
// already imported (and thus initialised) the shared i18n instance, so queries here
// must match the raw key *and* both translations.
const DAILY_GOODS_LABEL = /^itemTypeDailyGoods$|^日用品$|^Daily goods$/i;
const CATEGORY_NAME_PLACEHOLDER = /^categoryName$|^カテゴリ名$|^Category name$/i;

describe("CategoriesPage — カテゴリの既定の種別（食料品 / 日用品）", () => {
  let categoriesSpy: ReturnType<typeof spyOn>;
  let usageCountsSpy: ReturnType<typeof spyOn>;
  let createSpy: ReturnType<typeof spyOn>;
  let updateSpy: ReturnType<typeof spyOn>;
  let deleteSpy: ReturnType<typeof spyOn>;
  let createMutate: ReturnType<typeof mock>;
  let updateMutate: ReturnType<typeof mock>;

  beforeEach(() => {
    createMutate = mock(async () => ({ id: "cat-1", name: "洗剤" }));
    updateMutate = mock(async () => {});
    usageCountsSpy = spyOn(useMasterDataModule, "useCategoryUsageCounts").mockReturnValue({
      data: {},
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategoryUsageCounts>);
    createSpy = spyOn(useMasterDataModule, "useCreateCategory").mockReturnValue({
      mutateAsync: createMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCreateCategory>);
    updateSpy = spyOn(useMasterDataModule, "useUpdateCategory").mockReturnValue({
      mutateAsync: updateMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useUpdateCategory>);
    deleteSpy = spyOn(useMasterDataModule, "useDeleteCategory").mockReturnValue({
      mutateAsync: mock(async () => {}),
      isPending: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useDeleteCategory>);
  });

  afterEach(() => {
    categoriesSpy?.mockRestore();
    usageCountsSpy.mockRestore();
    createSpy.mockRestore();
    updateSpy.mockRestore();
    deleteSpy.mockRestore();
    cleanup();
  });

  const stubCategories = (data: unknown[]) => {
    categoriesSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data,
      isLoading: false,
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
  };

  it("日用品を選んで追加すると kind: 'daily_goods' で作成される", async () => {
    stubCategories([]);
    const user = userEvent.setup();
    const { getAllByRole, getByPlaceholderText } = renderPage();

    await user.type(getByPlaceholderText(CATEGORY_NAME_PLACEHOLDER), "洗剤");
    await user.click(getAllByRole("button", { name: DAILY_GOODS_LABEL })[0]!);
    await user.click(getAllByRole("button", { name: /^add$|追加|^Add$/i })[0]!);

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "洗剤", kind: "daily_goods" }),
    );
  });

  it("既定（未操作）では食料品として作成される", async () => {
    stubCategories([]);
    const user = userEvent.setup();
    const { getAllByRole, getByPlaceholderText } = renderPage();

    await user.type(getByPlaceholderText(CATEGORY_NAME_PLACEHOLDER), "野菜");
    await user.click(getAllByRole("button", { name: /^add$|追加|^Add$/i })[0]!);

    expect(createMutate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "野菜", kind: "food" }),
    );
  });

  it("日用品カテゴリだけ一覧にバッジが出る", () => {
    stubCategories([
      { id: "cat-1", name: "野菜", color: null, icon: null, kind: "food" },
      { id: "cat-2", name: "洗剤", color: null, icon: null, kind: "daily_goods" },
    ]);
    const { getAllByText } = renderPage();
    // 追加フォームのセグメント（1個）+ 一覧のバッジ（1個）
    expect(getAllByText(DAILY_GOODS_LABEL)).toHaveLength(2);
  });

  it("編集を開くと既存の kind が初期選択され、保存時にそのまま送られる", async () => {
    stubCategories([{ id: "cat-2", name: "洗剤", color: null, icon: null, kind: "daily_goods" }]);
    const { getAllByRole, getByRole } = renderPage();

    fireEvent.click(getByRole("button", { name: /^edit$|編集|^Edit$/i }));

    const dailyGoodsButtons = getAllByRole("button", { name: DAILY_GOODS_LABEL });
    // 編集行のセグメントは追加フォームの次に現れる
    expect(dailyGoodsButtons[1]?.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(getByRole("button", { name: /^save$|保存|^Save$/i }));
    await Promise.resolve();
    expect(updateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "cat-2", kind: "daily_goods" }),
    );
  });
});
