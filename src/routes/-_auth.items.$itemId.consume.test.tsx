import { cleanup, render } from "@testing-library/react";
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

const stubToast: ToastContextValue = { toasts: [], toast: () => {}, dismiss: () => {} };

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <routerContext.Provider value={stubRouter}>
    <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
  </routerContext.Provider>
);

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
});
