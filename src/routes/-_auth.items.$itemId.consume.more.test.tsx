import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { I18nextProvider } from "react-i18next";

import * as useItemLotsModule from "@/hooks/useItemLots";
import * as useItemsModule from "@/hooks/useItems";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";
import type { Item, ItemLot } from "@/types/item";

// Import routerContext via relative path (not in public package exports) to provide
// a minimal router stub so that useNavigate inside ItemConsumePage doesn't throw.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { ItemConsumePage, Route } from "./_auth.items.$itemId.consume";

const navigateMock = mock(() => Promise.resolve());

const stubRouter = {
  navigate: navigateMock,
  buildLocation: () => ({ href: "/" }),
  isServer: false,
  options: {},
  state: { location: { href: "/", pathname: "/" }, matches: [], pendingMatches: [] },
} as unknown as Parameters<typeof routerContext.Provider>[0]["value"];

const baseItem: Item = {
  id: "test-item-id",
  user_id: "test-user-id",
  name: "テスト商品",
  barcode: null,
  category_id: null,
  storage_location_id: null,
  units: 2,
  content_amount: 500,
  content_unit: "mL",
  opened_remaining: null,
  purchase_date: null,
  expiry_date: null,
  image_path: null,
  notes: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  deleted_at: null,
};

const baseLot: ItemLot = {
  id: "test-lot-id",
  user_id: "test-user-id",
  item_id: "test-item-id",
  units: 2,
  opened_remaining: null,
  purchase_date: null,
  expiry_date: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("ItemConsumePage (操作フロー)", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("ja");
  });

  let lotsSpy: ReturnType<typeof spyOn>;
  let itemSpy: ReturnType<typeof spyOn>;
  let consumeSpy: ReturnType<typeof spyOn>;
  let paramsSpy: ReturnType<typeof spyOn>;
  let searchSpy: ReturnType<typeof spyOn>;
  let mutateAsync: ReturnType<typeof mock>;
  let toastCalls: Array<{ message: string; variant?: string }>;

  const renderPage = () => {
    toastCalls = [];
    const toastStub: ToastContextValue = {
      toasts: [],
      toast: (message, variant) => toastCalls.push({ message, variant }),
      dismiss: () => {},
    };
    const Wrapper = ({ children }: { children: React.ReactNode }) => (
      <routerContext.Provider value={stubRouter}>
        <I18nextProvider i18n={i18n}>
          <ToastContext.Provider value={toastStub}>{children}</ToastContext.Provider>
        </I18nextProvider>
      </routerContext.Provider>
    );
    return render(<ItemConsumePage />, { wrapper: Wrapper as React.ComponentType });
  };

  beforeEach(() => {
    navigateMock.mockClear();
    paramsSpy = spyOn(Route, "useParams").mockReturnValue({
      itemId: "test-item-id",
    } as ReturnType<typeof Route.useParams>);
    searchSpy = spyOn(Route, "useSearch").mockReturnValue({
      lotId: undefined,
    } as ReturnType<typeof Route.useSearch>);
    lotsSpy = spyOn(useItemLotsModule, "useItemLots").mockReturnValue({
      data: [baseLot],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useItemLotsModule.useItemLots>);
    itemSpy = spyOn(useItemsModule, "useItem").mockReturnValue({
      data: baseItem,
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItem>);
    mutateAsync = mock(() => Promise.resolve(baseLot));
    consumeSpy = spyOn(useItemLotsModule, "useConsumeLot").mockReturnValue({
      mutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useItemLotsModule.useConsumeLot>);
  });

  afterEach(() => {
    paramsSpy.mockRestore();
    searchSpy.mockRestore();
    lotsSpy.mockRestore();
    itemSpy.mockRestore();
    consumeSpy.mockRestore();
    cleanup();
  });

  it("数量を入力するとプレビューが表示され、消費実行で mutateAsync が呼ばれる", async () => {
    const { getByRole, getByText } = renderPage();

    const input = getByRole("spinbutton") as HTMLInputElement;
    await userEvent.type(input, "500");

    // プレビュー (残り 1 個)
    expect(getByText(i18n.t("items:consumePreviewTitle"))).toBeDefined();

    const consumeButton = getByText(i18n.t("items:consume"), { exact: true }).closest(
      "button",
    ) as HTMLButtonElement;
    expect(consumeButton.disabled).toBe(false);
    fireEvent.click(consumeButton);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const arg = (mutateAsync.mock.calls[0] as unknown[])[0] as { deltaAmount: number };
    expect(arg.deltaAmount).toBe(500);

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "success")).toBe(true));
    expect(navigateMock).toHaveBeenCalled();
  });

  it("在庫を超える数量では insufficientStock エラーを表示し送信しない", async () => {
    const { getByRole, getByText } = renderPage();

    const input = getByRole("spinbutton") as HTMLInputElement;
    await userEvent.type(input, "99999");

    expect(getByText(i18n.t("items:insufficientStock"))).toBeDefined();

    const consumeButton = getByText(i18n.t("items:consume"), { exact: true }).closest(
      "button",
    ) as HTMLButtonElement;
    fireEvent.click(consumeButton);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("mutateAsync が失敗しても success トーストは出ない", async () => {
    mutateAsync.mockImplementation(() => Promise.reject(new Error("consume failed")));

    const { getByRole, getByText } = renderPage();

    await userEvent.type(getByRole("spinbutton") as HTMLInputElement, "100");
    fireEvent.click(
      getByText(i18n.t("items:consume"), { exact: true }).closest("button") as HTMLButtonElement,
    );

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(toastCalls.some((call) => call.variant === "success")).toBe(false);
  });

  it("全消費: 確認ダイアログ → 確定で総量を消費する", async () => {
    const { getByRole, getByText } = renderPage();

    // 全消費ボタン (合計 2 × 500 = 1000)
    const consumeAllButton = getByText(
      i18n.t("items:consumeAll", { amount: 1000, unit: "mL" }),
    ).closest("button") as HTMLButtonElement;
    fireEvent.click(consumeAllButton);

    // ConfirmDialog の確定ボタン
    const confirmLabel = getByText(i18n.t("items:consumeAllConfirmLabel"));
    fireEvent.click(confirmLabel.closest("button") as HTMLButtonElement);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    const arg = (mutateAsync.mock.calls[0] as unknown[])[0] as { deltaAmount: number };
    expect(arg.deltaAmount).toBe(1000);

    await waitFor(() => expect(toastCalls.some((call) => call.variant === "success")).toBe(true));
    expect(getByRole("spinbutton")).toBeDefined();
  });

  it("全消費: キャンセルでダイアログを閉じる", () => {
    const { getByText, queryByText } = renderPage();

    fireEvent.click(
      getByText(i18n.t("items:consumeAll", { amount: 1000, unit: "mL" })).closest(
        "button",
      ) as HTMLButtonElement,
    );
    expect(getByText(i18n.t("items:consumeAllTitle"))).toBeDefined();

    fireEvent.click(
      getByText(i18n.t("common:cancel"), { exact: true }).closest("button") as HTMLButtonElement,
    );
    expect(queryByText(i18n.t("items:consumeAllTitle"))).toBeNull();

    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("全消費: mutateAsync 失敗でダイアログを閉じる", async () => {
    mutateAsync.mockImplementation(() => Promise.reject(new Error("consume failed")));

    const { getByText, queryByText } = renderPage();

    fireEvent.click(
      getByText(i18n.t("items:consumeAll", { amount: 1000, unit: "mL" })).closest(
        "button",
      ) as HTMLButtonElement,
    );
    fireEvent.click(
      getByText(i18n.t("items:consumeAllConfirmLabel")).closest("button") as HTMLButtonElement,
    );

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    await waitFor(() => expect(queryByText(i18n.t("items:consumeAllTitle"))).toBeNull());
    expect(toastCalls.some((call) => call.variant === "success")).toBe(false);
  });

  it("複数ロット: ロットを選択すると入力欄が表示される", () => {
    const lot1: ItemLot = { ...baseLot, id: "lot-1", expiry_date: "2026-08-01" };
    const lot2: ItemLot = {
      ...baseLot,
      id: "lot-2",
      opened_remaining: 250,
      purchase_date: "2026-06-01",
    };
    lotsSpy.mockReturnValue({
      data: [lot1, lot2],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useItemLotsModule.useItemLots>);

    const { getAllByRole, getByRole, queryByRole, getByText } = renderPage();

    // 未選択時はヒントを表示
    expect(queryByRole("spinbutton")).toBeNull();
    expect(getByText(i18n.t("items:selectLotHint"))).toBeDefined();

    const radios = getAllByRole("radio");
    fireEvent.click(radios[1]!);

    expect(getByRole("spinbutton")).toBeDefined();
    expect(radios[1]?.getAttribute("aria-checked")).toBe("true");
  });

  it("開封済みロットは現在量を openedDisplay で表示する", () => {
    lotsSpy.mockReturnValue({
      data: [{ ...baseLot, units: 2, opened_remaining: 250 }],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useItemLotsModule.useItemLots>);

    const { getByText } = renderPage();
    expect(getByText(/開封中/)).toBeDefined();
  });

  it("戻るボタンで navigate が呼ばれる", () => {
    const { container } = renderPage();

    const backButton = container.querySelector("svg.lucide-arrow-left")?.closest("button");
    fireEvent.click(backButton!);

    expect(navigateMock).toHaveBeenCalled();
  });
});
