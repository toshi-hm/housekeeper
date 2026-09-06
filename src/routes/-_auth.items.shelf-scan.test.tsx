import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useItemsModule from "@/hooks/useItems";
import * as useMasterDataModule from "@/hooks/useMasterData";
import * as useShelfScanModule from "@/hooks/useShelfScan";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

import { ShelfScanCapturePage } from "./_auth.items.shelf-scan";

const stubToast: ToastContextValue = { toasts: [], toast: () => "toast-id", dismiss: () => {} };

// ItemCard.test.tsxと同じ手法: <Link>/useNavigateが動く実際の(メモリ履歴)ルーター
// でラップする。receipt-scanのルートテストが使うrouterContextの直接importより、
// このリポジトリ内で広く使われている手法を優先する。
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

const renderPage = async () => {
  const Wrapper = makeWrapper(<ShelfScanCapturePage />);
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<Wrapper />);
  });
  return result;
};

describe("ShelfScanCapturePage", () => {
  afterEach(() => {
    mock.restore();
  });

  test("カテゴリ・保管場所のいずれも未選択のときは撮影ボタンが無効", async () => {
    spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [{ id: "c1", name: "野菜" }],
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
    spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [{ id: "l1", name: "冷蔵庫" }],
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocations>);

    const { getByRole } = await renderPage();

    const startButton = getByRole("button", {
      name: i18n.t("startCapture", { ns: "shelfScan" }),
    }) as HTMLButtonElement;
    expect(startButton.disabled).toBe(true);
  });

  test("保管場所を選択すると撮影ボタンが有効になり、押すとカメラモーダルが開く", async () => {
    spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
    spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [{ id: "l1", name: "冷蔵庫" }],
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocations>);

    const { getByRole, getByLabelText, getByText } = await renderPage();

    const locationSelect = getByLabelText(i18n.t("storageLocation", { ns: "items" }));
    fireEvent.change(locationSelect, { target: { value: "l1" } });

    const startButton = getByRole("button", {
      name: i18n.t("startCapture", { ns: "shelfScan" }),
    }) as HTMLButtonElement;
    expect(startButton.disabled).toBe(false);

    fireEvent.click(startButton);

    expect(getByText(i18n.t("cameraTitle", { ns: "shelfScan" }))).toBeTruthy();
  });

  test("撮影が成功すると、既存アイテムとの差分を計算してレビュー画面へ進む", async () => {
    spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
    spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [{ id: "l1", name: "冷蔵庫" }],
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    spyOn(useItemsModule, "fetchItems").mockResolvedValue([
      { id: "item-1", name: "牛乳", units: 1 },
      // units=0のアイテムはマッチング対象から除外される
      { id: "item-2", name: "卵", units: 0 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ] as any);

    const scanMutateAsync = mock(() => Promise.resolve({ items: ["牛乳", "醤油"] }));
    spyOn(useShelfScanModule, "useShelfScan").mockReturnValue({
      mutateAsync: scanMutateAsync,
    } as unknown as ReturnType<typeof useShelfScanModule.useShelfScan>);

    const { getByRole, getByLabelText, getByText, queryByText, container } = await renderPage();

    const locationSelect = getByLabelText(i18n.t("storageLocation", { ns: "items" }));
    fireEvent.change(locationSelect, { target: { value: "l1" } });
    fireEvent.click(getByRole("button", { name: i18n.t("startCapture", { ns: "shelfScan" }) }));

    // ShelfScanCameraのフォールバック(ファイル選択)から撮影完了をシミュレートする。
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["dummy-image-bytes"], "shelf.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
      await Promise.resolve();
    });

    expect(scanMutateAsync).toHaveBeenCalledTimes(1);
    expect(useItemsModule.fetchItems).toHaveBeenCalledWith({
      categoryId: undefined,
      storageLocationId: "l1",
    });

    // 「牛乳」は在庫・写真の両方にあるためどちらの候補にも入らない。
    // 「卵」はunits=0のため対象外（食べきった？候補にも入らない）。
    // 「醤油」は写真にのみ存在するため未登録候補になる。
    await waitFor(() => expect(getByText("醤油")).toBeTruthy());
    expect(queryByText("牛乳")).toBeNull();
    expect(queryByText("卵")).toBeNull();
    expect(getByText(i18n.t("possiblyConsumedEmpty", { ns: "shelfScan" }))).toBeTruthy();
  });
});
