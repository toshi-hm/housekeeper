import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock, spyOn } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useMasterDataModule from "../../hooks/useMasterData";
import i18n from "../../lib/i18n";
import { ToastContext, type ToastContextValue } from "../../lib/toast-context";
import type { Item } from "../../types/item";
import { PurchaseDialog } from "./PurchaseDialog";

const stubToast: ToastContextValue = { toasts: [], toast: () => {}, dismiss: () => {} };

const makeWrapper =
  (queryClient: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
      </I18nextProvider>
    </QueryClientProvider>
  );

describe("PurchaseDialog", () => {
  it("renders nothing when closed", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <PurchaseDialog open={false} onSubmit={() => {}} onClose={() => {}} />,
      { wrapper: makeWrapper(qc) },
    );
    expect(container.firstChild).toBeNull();
  });

  it("close button is enabled by default (isSubmitting=false)", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useCategories>);
    const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);

    const { getAllByRole } = render(
      <PurchaseDialog open={true} onSubmit={() => {}} onClose={() => {}} isSubmitting={false} />,
      { wrapper: makeWrapper(qc) },
    );

    const buttons = getAllByRole("button");
    const closeButton = buttons.find((b) => b.querySelector("svg.lucide-x"));
    expect(closeButton).toBeDefined();
    expect((closeButton as HTMLButtonElement).disabled).toBe(false);

    catSpy.mockRestore();
    locSpy.mockRestore();
  });

  it("close button is disabled when isSubmitting=true", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useCategories>);
    const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);

    const { getAllByRole } = render(
      <PurchaseDialog open={true} onSubmit={() => {}} onClose={() => {}} isSubmitting={true} />,
      { wrapper: makeWrapper(qc) },
    );

    const buttons = getAllByRole("button");
    const closeButton = buttons.find((b) => b.querySelector("svg.lucide-x"));
    expect(closeButton).toBeDefined();
    expect((closeButton as HTMLButtonElement).disabled).toBe(true);

    catSpy.mockRestore();
    locSpy.mockRestore();
  });

  it("close button has an accessible label", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useCategories>);
    const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);

    const { getByRole } = render(
      <PurchaseDialog open={true} onSubmit={() => {}} onClose={() => {}} isSubmitting={false} />,
      { wrapper: makeWrapper(qc) },
    );

    expect(getByRole("button", { name: i18n.t("common:close") })).toBeDefined();

    catSpy.mockRestore();
    locSpy.mockRestore();
  });

  it("calls onClose exactly once when the backdrop is clicked", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useCategories>);
    const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    const onClose = mock(() => {});

    const { container } = render(
      <PurchaseDialog open={true} onSubmit={() => {}} onClose={onClose} isSubmitting={false} />,
      { wrapper: makeWrapper(qc) },
    );

    fireEvent.click(container.firstChild as Element);
    expect(onClose).toHaveBeenCalledTimes(1);

    catSpy.mockRestore();
    locSpy.mockRestore();
  });

  it("does not call onClose when the dialog content is clicked", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useCategories>);
    const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    const onClose = mock(() => {});

    const { getByText } = render(
      <PurchaseDialog open={true} onSubmit={() => {}} onClose={onClose} isSubmitting={false} />,
      { wrapper: makeWrapper(qc) },
    );

    fireEvent.click(getByText(i18n.t("shopping:purchaseDialog")));
    expect(onClose).not.toHaveBeenCalled();

    catSpy.mockRestore();
    locSpy.mockRestore();
  });

  it("calls onClose exactly once when Escape is pressed", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useCategories>);
    const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    const onClose = mock(() => {});

    render(
      <PurchaseDialog open={true} onSubmit={() => {}} onClose={onClose} isSubmitting={false} />,
      { wrapper: makeWrapper(qc) },
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    catSpy.mockRestore();
    locSpy.mockRestore();
  });

  it("does not call onClose on Escape while isSubmitting", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useCategories>);
    const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    const onClose = mock(() => {});

    render(
      <PurchaseDialog open={true} onSubmit={() => {}} onClose={onClose} isSubmitting={true} />,
      { wrapper: makeWrapper(qc) },
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    catSpy.mockRestore();
    locSpy.mockRestore();
  });

  // #830: 既存アイテムへ統合される場合、フォームの初期値が空欄のまま（＝既存値が
  // 見えない）ままだと、入力しても保存後に消えたように見える。
  describe("existingItem が渡された場合 (#830)", () => {
    const existingItem: Item = {
      id: "item-1",
      user_id: "user-1",
      name: "有機牛乳",
      category_id: null,
      storage_location_id: null,
      units: 0,
      content_amount: 1000,
      content_unit: "mL",
      notes: "いつものスーパーで購入",
      minimum_stock: 1,
      auto_reorder: true,
      reorder_threshold: 1,
      expiry_type: "best_before",
      image_path: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };

    it("統合先アイテム名を知らせるバナーを表示する", () => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
        data: [],
      } as ReturnType<typeof useMasterDataModule.useCategories>);
      const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
        data: [],
      } as ReturnType<typeof useMasterDataModule.useStorageLocations>);

      const { getByText } = render(
        <PurchaseDialog
          open={true}
          itemName="有機牛乳"
          existingItem={existingItem}
          onSubmit={() => {}}
          onClose={() => {}}
        />,
        { wrapper: makeWrapper(qc) },
      );

      expect(
        getByText(i18n.t("shopping:mergeIntoExistingItem", { name: "有機牛乳" })),
      ).toBeDefined();

      catSpy.mockRestore();
      locSpy.mockRestore();
    });

    it("メモ欄に既存アイテムの notes を初期表示する", () => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
        data: [],
      } as ReturnType<typeof useMasterDataModule.useCategories>);
      const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
        data: [],
      } as ReturnType<typeof useMasterDataModule.useStorageLocations>);

      const { getByLabelText } = render(
        <PurchaseDialog
          open={true}
          itemName="有機牛乳"
          existingItem={existingItem}
          onSubmit={() => {}}
          onClose={() => {}}
        />,
        { wrapper: makeWrapper(qc) },
      );

      expect((getByLabelText(i18n.t("items:notes")) as HTMLTextAreaElement).value).toBe(
        "いつものスーパーで購入",
      );

      catSpy.mockRestore();
      locSpy.mockRestore();
    });

    it("existingItem が無い通常の購入では既存値バナーを表示しない", () => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
        data: [],
      } as ReturnType<typeof useMasterDataModule.useCategories>);
      const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
        data: [],
      } as ReturnType<typeof useMasterDataModule.useStorageLocations>);

      const { queryByText } = render(
        <PurchaseDialog open={true} itemName="牛乳" onSubmit={() => {}} onClose={() => {}} />,
        { wrapper: makeWrapper(qc) },
      );

      expect(queryByText(i18n.t("shopping:mergeIntoExistingItem", { name: "牛乳" }))).toBeNull();

      catSpy.mockRestore();
      locSpy.mockRestore();
    });
  });

  // #929 セルフレビュー: existingItem の item_type を渡し忘れると、日用品への
  // 統合なのに期限欄が出て、入力された期限がロット経由でアイテムに戻ってしまう。
  it("統合先が日用品のアイテムなら期限欄を出さない", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useCategories>);
    const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);

    const existingItem = {
      id: "item-1",
      user_id: "user-1",
      name: "食器用洗剤",
      units: 1,
      content_amount: 1,
      content_unit: "個",
      item_type: "daily_goods",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    } as Item;

    const { container, getByRole } = render(
      <PurchaseDialog
        open={true}
        itemName="食器用洗剤"
        existingItem={existingItem}
        onSubmit={() => {}}
        onClose={() => {}}
      />,
      { wrapper: makeWrapper(qc) },
    );

    expect(container.querySelector("#expiry_date")).toBeNull();
    expect(
      getByRole("button", { name: i18n.t("items:itemTypeDailyGoods") }).getAttribute(
        "aria-pressed",
      ),
    ).toBe("true");

    catSpy.mockRestore();
    locSpy.mockRestore();
  });
});
