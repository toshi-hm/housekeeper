import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";

import * as useItemLotsModule from "@/hooks/useItemLots";
import * as useItemsModule from "@/hooks/useItems";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";
import type { Item, ItemLot } from "@/types/item";

// Import routerContext via relative path (not in public package exports) to provide
// a minimal router stub so that useNavigate inside ItemConsumePage doesn't throw.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { ItemConsumePage, Route } from "./_auth.items.$itemId.consume";

// Minimal stub that satisfies what useNavigate reads off the router.
const stubRouter = {
  navigate: () => Promise.resolve(),
  buildLocation: () => ({ href: "/" }),
  isServer: false,
  options: {},
  state: { location: { href: "/", pathname: "/" }, matches: [], pendingMatches: [] },
} as unknown as Parameters<typeof routerContext.Provider>[0]["value"];

const stubToast: ToastContextValue = { toasts: [], toast: () => "toast-id", dismiss: () => {} };

// ItemConsumePage now calls useQueryClient() directly (to invalidate queries
// after an undo, #478) in addition to the already-mocked useItem/useItemLots
// query hooks, so it needs a real QueryClientProvider in scope even though
// the query hooks themselves are spied on below.
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

// Captures the action button (e.g. "元に戻す"/Undo) passed to the most recent
// toast() call, so tests can invoke it directly instead of rendering the real
// ToastProvider (#713).
interface CapturedToastAction {
  label: string;
  onClick: () => void;
}

const createCapturingToast = (): {
  toastValue: ToastContextValue;
  getLastAction: () => CapturedToastAction | undefined;
} => {
  let lastAction: CapturedToastAction | undefined;
  return {
    toastValue: {
      toasts: [],
      toast: (_message, _variant, options) => {
        lastAction = options?.action;
        return "toast-id";
      },
      dismiss: () => {},
    },
    getLastAction: () => lastAction,
  };
};

const baseItem: Item = {
  id: "test-item-id",
  user_id: "test-user-id",
  name: "テスト商品",
  barcode: null,
  category_id: null,
  storage_location_id: null,
  units: 1,
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
  units: 1,
  opened_remaining: null,
  purchase_date: null,
  expiry_date: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const renderPage = () => render(<ItemConsumePage />, { wrapper: Wrapper as React.ComponentType });

describe("ItemConsumePage", () => {
  let lotsspy: ReturnType<typeof spyOn>;
  let itemspy: ReturnType<typeof spyOn>;
  let consumespy: ReturnType<typeof spyOn>;
  let paramsspy: ReturnType<typeof spyOn>;
  let searchspy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    paramsspy = spyOn(Route, "useParams").mockReturnValue({
      itemId: "test-item-id",
    } as ReturnType<typeof Route.useParams>);

    searchspy = spyOn(Route, "useSearch").mockReturnValue({
      lotId: undefined,
    } as ReturnType<typeof Route.useSearch>);

    lotsspy = spyOn(useItemLotsModule, "useItemLots").mockReturnValue({
      data: [baseLot],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useItemLotsModule.useItemLots>);

    itemspy = spyOn(useItemsModule, "useItem").mockReturnValue({
      data: baseItem,
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItem>);

    consumespy = spyOn(useItemLotsModule, "useConsumeLot").mockReturnValue({
      mutateAsync: async () => baseLot,
      isPending: false,
    } as unknown as ReturnType<typeof useItemLotsModule.useConsumeLot>);
  });

  afterEach(() => {
    paramsspy.mockRestore();
    searchspy.mockRestore();
    lotsspy.mockRestore();
    itemspy.mockRestore();
    consumespy.mockRestore();
    cleanup();
  });

  it("戻るボタンにaria-labelが付与されている(#862)", () => {
    const { getByRole } = renderPage();
    expect(getByRole("button", { name: /^back$|戻る|^Back$/i })).toBeDefined();
  });

  it("shows spinner while item is loading", () => {
    itemspy.mockReturnValue({ data: undefined, isLoading: true } as ReturnType<
      typeof useItemsModule.useItem
    >);
    const { getByRole, queryByRole } = renderPage();
    expect(getByRole("status")).toBeDefined();
    expect(queryByRole("spinbutton")).toBeNull();
  });

  it("shows spinner while lots are loading", () => {
    lotsspy.mockReturnValue({ data: [], isLoading: true, isError: false } as ReturnType<
      typeof useItemLotsModule.useItemLots
    >);
    const { getByRole, queryByRole } = renderPage();
    expect(getByRole("status")).toBeDefined();
    expect(queryByRole("spinbutton")).toBeNull();
  });

  it("shows error message when lots query fails", () => {
    lotsspy.mockReturnValue({ data: [], isLoading: false, isError: true } as ReturnType<
      typeof useItemLotsModule.useItemLots
    >);
    const { getByText, queryByRole } = renderPage();
    expect(getByText(/lotsLoadError|Failed to load stock|在庫ロットの読み込み/)).toBeDefined();
    expect(queryByRole("spinbutton")).toBeNull();
  });

  it("shows item not found when item is null and not loading", () => {
    itemspy.mockReturnValue({ data: undefined, isLoading: false } as ReturnType<
      typeof useItemsModule.useItem
    >);
    const { getByText } = renderPage();
    expect(getByText(/^itemNotFound$|^Item not found$|^アイテムが見つかりません$/)).toBeDefined();
  });

  it("shows no stock message when there are no lots", () => {
    lotsspy.mockReturnValue({ data: [], isLoading: false, isError: false } as ReturnType<
      typeof useItemLotsModule.useItemLots
    >);
    const { getByText, queryByRole } = renderPage();
    expect(getByText(/noStockToConsume|No stock available|在庫がありません/)).toBeDefined();
    expect(queryByRole("spinbutton")).toBeNull();
  });

  it("shows no stock message when all lots have zero units and no opened_remaining", () => {
    lotsspy.mockReturnValue({
      data: [{ ...baseLot, units: 0, opened_remaining: null }],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useItemLotsModule.useItemLots>);
    const { getByText, queryByRole } = renderPage();
    expect(getByText(/noStockToConsume|No stock available|在庫がありません/)).toBeDefined();
    expect(queryByRole("spinbutton")).toBeNull();
  });

  it("shows no stock message when the only lot has opened_remaining of exactly 0", () => {
    lotsspy.mockReturnValue({
      data: [{ ...baseLot, units: 1, opened_remaining: 0 }],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useItemLotsModule.useItemLots>);
    const { getByText, queryByRole } = renderPage();
    expect(getByText(/noStockToConsume|No stock available|在庫がありません/)).toBeDefined();
    expect(queryByRole("spinbutton")).toBeNull();
  });

  it("shows numeric input when there is one active lot", () => {
    const { getByRole } = renderPage();
    expect(getByRole("spinbutton")).toBeDefined();
  });

  it("shows numeric input when lot has opened_remaining (active even with units=1)", () => {
    lotsspy.mockReturnValue({
      data: [{ ...baseLot, units: 1, opened_remaining: 250 }],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useItemLotsModule.useItemLots>);
    const { getByRole } = renderPage();
    expect(getByRole("spinbutton")).toBeDefined();
  });

  it("renders lot selector as radiogroup with radio buttons when multiple lots exist", () => {
    const lot1: ItemLot = { ...baseLot, id: "lot-1" };
    const lot2: ItemLot = { ...baseLot, id: "lot-2" };
    lotsspy.mockReturnValue({
      data: [lot1, lot2],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useItemLotsModule.useItemLots>);
    const { getByRole, getAllByRole } = renderPage();
    expect(getByRole("radiogroup")).toBeDefined();
    const radios = getAllByRole("radio");
    expect(radios.length).toBe(2);
  });

  it("marks the selected lot radio button as checked", () => {
    const lot1: ItemLot = { ...baseLot, id: "lot-1" };
    const lot2: ItemLot = { ...baseLot, id: "lot-2" };
    lotsspy.mockReturnValue({
      data: [lot1, lot2],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useItemLotsModule.useItemLots>);
    searchspy.mockReturnValue({
      lotId: "lot-1",
    } as ReturnType<typeof Route.useSearch>);
    const { getAllByRole } = renderPage();
    const radios = getAllByRole("radio");
    expect(radios[0]?.getAttribute("aria-checked")).toBe("true");
    expect(radios[1]?.getAttribute("aria-checked")).toBe("false");
  });

  it("does not render radiogroup when there is only one active lot", () => {
    const { queryByRole } = renderPage();
    expect(queryByRole("radiogroup")).toBeNull();
  });

  it("falls back to the sole active lot when the URL lotId is stale/nonexistent (#485)", () => {
    // Only one active lot remains, but the URL still points at a lotId that
    // no longer exists (already consumed, concurrent update, stale back/forward
    // navigation, ...). The form must still render instead of going blank.
    searchspy.mockReturnValue({
      lotId: "stale-nonexistent-lot-id",
    } as ReturnType<typeof Route.useSearch>);
    const { getByRole, queryByText } = renderPage();
    expect(getByRole("spinbutton")).toBeDefined();
    expect(queryByText(/selectLotHint|Select a lot above|上からロットを選んでください/)).toBeNull();
  });

  it("shows the select-lot hint (not a blank form) when a stale lotId is given and multiple active lots remain", () => {
    const lot1: ItemLot = { ...baseLot, id: "lot-1" };
    const lot2: ItemLot = { ...baseLot, id: "lot-2" };
    lotsspy.mockReturnValue({
      data: [lot1, lot2],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useItemLotsModule.useItemLots>);
    searchspy.mockReturnValue({
      lotId: "stale-nonexistent-lot-id",
    } as ReturnType<typeof Route.useSearch>);
    const { getByText, queryByRole } = renderPage();
    expect(queryByRole("spinbutton")).toBeNull();
    expect(
      getByText(/selectLotHint|Select a lot above|上からロットを選んでください/),
    ).toBeDefined();
  });

  // Unit conversion (issue #462): the amount-used input for a mL/L/g/kg item
  // gets a unit dropdown so the user can enter the delta in a different but
  // convertible unit; internally it's converted to item.content_unit before
  // being handed to computeConsumption / the mutation.
  describe("unit conversion", () => {
    it("shows a unit selector with convertible units for a volume item (mL)", () => {
      const { getByRole } = renderPage();
      const select = getByRole("combobox", {
        name: /consumeUnit|消費量の単位|Unit for amount used/,
      });
      const options = Array.from((select as HTMLSelectElement).options).map((o) => o.value);
      expect(options.sort()).toEqual(["L", "mL"].sort());
    });

    it("does not show a unit selector for a count-based item (個) with no convertible units", () => {
      itemspy.mockReturnValue({
        data: { ...baseItem, content_unit: "個" },
        isLoading: false,
      } as ReturnType<typeof useItemsModule.useItem>);
      const { queryByRole } = renderPage();
      expect(
        queryByRole("combobox", { name: /consumeUnit|消費量の単位|Unit for amount used/ }),
      ).toBeNull();
    });

    it("shows a conversion hint once a different convertible unit is selected and an amount entered", async () => {
      const user = userEvent.setup();
      const { getByRole, getByText, queryByText } = renderPage();
      const amountInput = getByRole("spinbutton");
      const unitSelect = getByRole("combobox", {
        name: /consumeUnit|消費量の単位|Unit for amount used/,
      });

      // No hint while the unit still matches item.content_unit.
      await user.type(amountInput, "100");
      expect(queryByText(/consumeConvertedHint|Recorded as|として記録されます/)).toBeNull();

      await act(async () => {
        fireEvent.change(unitSelect, { target: { value: "L" } });
      });
      // The i18n instance is a process-wide singleton (bun:test runs all files
      // in one process): whether "consumeConvertedHint" renders as the raw key
      // or its real translation depends on whether another already-run test
      // file has initialized it, so match either form.
      expect(getByText(/consumeConvertedHint|Recorded as|として記録されます/)).toBeDefined();
    });

    it("validates over-consumption using the converted amount, not the raw input value (#462)", async () => {
      // baseItem: units=1, content_amount=500 mL, opened_remaining=null -> total stock 500mL.
      // Entering "0.6" while the unit selector is set to L converts to 600mL, which exceeds
      // the 500mL total and must be flagged as insufficient stock. If the raw "0.6" were used
      // without conversion it would look like ample stock (0.6 < 500) and wrongly pass.
      const user = userEvent.setup();
      const { getByRole, getByText } = renderPage();
      const amountInput = getByRole("spinbutton");
      const unitSelect = getByRole("combobox", {
        name: /consumeUnit|消費量の単位|Unit for amount used/,
      });

      await act(async () => {
        fireEvent.change(unitSelect, { target: { value: "L" } });
      });
      await user.type(amountInput, "0.6");

      // insufficientStock is resolved from the "common" namespace (#915); match either
      // the raw key or its real translation depending on i18n init state (see comment above).
      expect(getByText(/insufficientStockError|Not enough stock|在庫が足りません/)).toBeDefined();
    });

    it("allows exactly consuming the full lot when entered in a converted unit", async () => {
      // 0.5 L converts to exactly 500mL, the lot's full stock -> no insufficientStock error.
      const user = userEvent.setup();
      const { getByRole, queryByText } = renderPage();
      const amountInput = getByRole("spinbutton");
      const unitSelect = getByRole("combobox", {
        name: /consumeUnit|消費量の単位|Unit for amount used/,
      });

      await act(async () => {
        fireEvent.change(unitSelect, { target: { value: "L" } });
      });
      await user.type(amountInput, "0.5");

      expect(queryByText(/insufficientStockError|Not enough stock|在庫が足りません/)).toBeNull();
    });
  });
});

// 消費実行後の「元に戻す」トースト・取り消し導線（#713）。既存のUndoパターン
// （カレンダーのチェック取り消し・自動アーカイブ）と同じ useUndoableAction を
// 再利用しているため、ここでは「トーストのアクションボタンが呼ばれたら
// restoreLotConsumption に正しい引数を渡す」ことを確認する。
describe("ItemConsumePage consume undo", () => {
  let lotsspy: ReturnType<typeof spyOn>;
  let itemspy: ReturnType<typeof spyOn>;
  let consumespy: ReturnType<typeof spyOn>;
  let paramsspy: ReturnType<typeof spyOn>;
  let searchspy: ReturnType<typeof spyOn>;
  let restoreSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    paramsspy = spyOn(Route, "useParams").mockReturnValue({
      itemId: "test-item-id",
    } as ReturnType<typeof Route.useParams>);

    searchspy = spyOn(Route, "useSearch").mockReturnValue({
      lotId: undefined,
    } as ReturnType<typeof Route.useSearch>);

    lotsspy = spyOn(useItemLotsModule, "useItemLots").mockReturnValue({
      data: [baseLot],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useItemLotsModule.useItemLots>);

    itemspy = spyOn(useItemsModule, "useItem").mockReturnValue({
      data: baseItem,
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItem>);

    consumespy = spyOn(useItemLotsModule, "useConsumeLot").mockReturnValue({
      mutateAsync: async () => ({ ...baseLot, _logId: "log-1" }),
      isPending: false,
    } as unknown as ReturnType<typeof useItemLotsModule.useConsumeLot>);

    restoreSpy = spyOn(useItemLotsModule, "restoreLotConsumption").mockResolvedValue(undefined);
  });

  afterEach(() => {
    paramsspy.mockRestore();
    searchspy.mockRestore();
    lotsspy.mockRestore();
    itemspy.mockRestore();
    consumespy.mockRestore();
    restoreSpy.mockRestore();
    cleanup();
  });

  it("shows an undo action after a successful consume, and restores the lot's pre-consume state when it is invoked", async () => {
    const { toastValue, getLastAction } = createCapturingToast();
    const CapturingWrapper = ({ children }: { children: React.ReactNode }) => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return (
        <QueryClientProvider client={queryClient}>
          <routerContext.Provider value={stubRouter}>
            <ToastContext.Provider value={toastValue}>{children}</ToastContext.Provider>
          </routerContext.Provider>
        </QueryClientProvider>
      );
    };

    const user = userEvent.setup();
    const { getByRole } = render(<ItemConsumePage />, {
      wrapper: CapturingWrapper as React.ComponentType,
    });

    await user.type(getByRole("spinbutton"), "100");
    await act(async () => {
      fireEvent.click(getByRole("button", { name: /^(使う|Use|consume)$/ }));
    });

    // The success toast (rendered by consumeUndo.start) carries the "元に戻す"
    // action button — capture it instead of asserting on toast markup, since
    // the toast itself is stubbed out here.
    const action = getLastAction();
    expect(action).toBeDefined();

    await act(async () => {
      action?.onClick();
    });

    expect(restoreSpy).toHaveBeenCalledWith({
      lotId: baseLot.id,
      itemId: baseItem.id,
      unitsBefore: baseLot.units,
      openedRemainingBefore: baseLot.opened_remaining ?? null,
      openedAtBefore: baseLot.opened_at ?? null,
      unitsAfter: baseLot.units,
      openedRemainingAfter: baseLot.opened_remaining ?? null,
      logId: "log-1",
    });
  });
});
