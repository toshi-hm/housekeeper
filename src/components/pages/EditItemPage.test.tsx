import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import React from "react";

import * as MultiTagSelectModule from "@/components/molecules/MultiTagSelect";
import * as ItemFormModule from "@/components/organisms/ItemForm";
import * as useItemLotsModule from "@/hooks/useItemLots";
import * as useItemsModule from "@/hooks/useItems";
import * as useTagsModule from "@/hooks/useTags";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";
import type { Item, ItemFormValues, ItemLot } from "@/types/item";

// ItemForm/MultiTagSelect pull in barcode scanning, image upload and
// master-data hooks irrelevant to the tests below, so they are replaced with
// lightweight stubs, same approach (and same leak-avoidance rationale via
// spyOn + mockRestore) as NewItemPage.test.tsx.
const submittedFormValues: ItemFormValues = {
  name: "テスト商品",
  units: 3,
  content_amount: 1,
  content_unit: "個",
};

const StubItemForm = ({
  onSubmit,
  extraFields,
}: {
  onSubmit: (values: ItemFormValues) => void;
  extraFields?: React.ReactNode;
}) => (
  <div>
    {extraFields}
    <button type="button" data-testid="submit-form" onClick={() => onSubmit(submittedFormValues)}>
      submit
    </button>
  </div>
);

const StubMultiTagSelect = () => <div data-testid="tag-select" />;

let itemFormSpy: ReturnType<typeof spyOn>;
let multiTagSelectSpy: ReturnType<typeof spyOn>;

beforeEach(() => {
  itemFormSpy = spyOn(ItemFormModule, "ItemForm").mockImplementation(
    StubItemForm as unknown as typeof ItemFormModule.ItemForm,
  );
  multiTagSelectSpy = spyOn(MultiTagSelectModule, "MultiTagSelect").mockImplementation(
    StubMultiTagSelect as unknown as typeof MultiTagSelectModule.MultiTagSelect,
  );
});

afterEach(() => {
  itemFormSpy.mockRestore();
  multiTagSelectSpy.mockRestore();
  cleanup();
});

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { EditItemPage } from "./EditItemPage";

const stubRouter = {
  navigate: () => Promise.resolve(),
  buildLocation: () => ({ href: "/" }),
  isServer: false,
  options: {},
  state: { location: { href: "/", pathname: "/" }, matches: [], pendingMatches: [] },
} as unknown as Parameters<typeof routerContext.Provider>[0]["value"];

const stubToast: ToastContextValue = { toasts: [], toast: () => {}, dismiss: () => {} };

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const [client] = React.useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <routerContext.Provider value={stubRouter}>
        <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
      </routerContext.Provider>
    </QueryClientProvider>
  );
};

const baseItem: Item = {
  id: "item-1",
  user_id: "user-1",
  name: "テスト商品",
  units: 0,
  content_amount: 1,
  content_unit: "個",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const baseLot: ItemLot = {
  id: "lot-1",
  user_id: "user-1",
  item_id: "item-1",
  units: 2,
  opened_remaining: null,
  purchase_date: null,
  expiry_date: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

// #824: an item whose lots were all fully consumed (item_lots empty,
// items.units = 0) must not have `units` written straight onto `items` when
// re-entered as stock via the edit form — that desyncs it from the lot-based
// consume flow (the consume page and syncItemAggregate only ever look at
// item_lots). It must create a backing lot instead.
describe("EditItemPage - backing a lot-less item's units increase with a real lot (#824)", () => {
  let itemSpy: ReturnType<typeof spyOn>;
  let lotsSpy: ReturnType<typeof spyOn>;
  let tagsSpy: ReturnType<typeof spyOn>;
  let itemTagIdsSpy: ReturnType<typeof spyOn>;
  let setItemTagsSpy: ReturnType<typeof spyOn>;
  let updateItemMutateAsync: ReturnType<typeof mock>;
  let updateLotMutateAsync: ReturnType<typeof mock>;
  let createLotMutateAsync: ReturnType<typeof mock>;

  beforeEach(() => {
    tagsSpy = spyOn(useTagsModule, "useTags").mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useTagsModule.useTags>);
    itemTagIdsSpy = spyOn(useTagsModule, "useItemTagIds").mockReturnValue({
      data: [],
      isSuccess: true,
    } as unknown as ReturnType<typeof useTagsModule.useItemTagIds>);
    setItemTagsSpy = spyOn(useTagsModule, "setItemTags").mockResolvedValue(undefined);
    spyOn(useTagsModule, "useCreateTag").mockReturnValue({
      mutateAsync: async () => ({}),
    } as unknown as ReturnType<typeof useTagsModule.useCreateTag>);

    updateItemMutateAsync = mock(async () => baseItem);
    spyOn(useItemsModule, "useUpdateItem").mockReturnValue({
      mutateAsync: updateItemMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useItemsModule.useUpdateItem>);

    updateLotMutateAsync = mock(async () => baseLot);
    spyOn(useItemLotsModule, "useUpdateLot").mockReturnValue({
      mutateAsync: updateLotMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useItemLotsModule.useUpdateLot>);

    createLotMutateAsync = mock(async () => baseLot);
    spyOn(useItemLotsModule, "useCreateLot").mockReturnValue({
      mutateAsync: createLotMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useItemLotsModule.useCreateLot>);
  });

  afterEach(() => {
    itemSpy.mockRestore();
    lotsSpy.mockRestore();
    tagsSpy.mockRestore();
    itemTagIdsSpy.mockRestore();
    setItemTagsSpy.mockRestore();
  });

  it("creates a backing lot instead of writing units straight onto items when the item has zero lots", async () => {
    itemSpy = spyOn(useItemsModule, "useItem").mockReturnValue({
      data: baseItem,
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItem>);
    lotsSpy = spyOn(useItemLotsModule, "useItemLots").mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useItemLotsModule.useItemLots>);

    const { getByTestId } = render(<EditItemPage itemId="item-1" />, { wrapper: Wrapper });
    fireEvent.click(getByTestId("submit-form"));

    await waitFor(() => expect(createLotMutateAsync).toHaveBeenCalled());

    expect(createLotMutateAsync).toHaveBeenCalledWith({
      itemId: "item-1",
      values: {
        units: 3,
        opened_remaining: null,
        unit_price: null,
        purchase_date: null,
        expiry_date: null,
        store_name: null,
      },
    });
    expect(updateLotMutateAsync).not.toHaveBeenCalled();

    // The direct items update must not smuggle lot-only fields (units etc.)
    // onto items — syncItemAggregate (run inside useCreateLot) is the only
    // thing allowed to set items.units once a lot exists.
    const itemUpdatePayload = updateItemMutateAsync.mock.calls[0]?.[0];
    expect(itemUpdatePayload).not.toHaveProperty("units");
    expect(itemUpdatePayload).not.toHaveProperty("opened_remaining");
    expect(itemUpdatePayload).not.toHaveProperty("purchase_date");
    expect(itemUpdatePayload).not.toHaveProperty("expiry_date");
    expect(itemUpdatePayload).not.toHaveProperty("store_name");
  });

  it("updates the existing lot (not creates a new one) when the item already has a lot", async () => {
    itemSpy = spyOn(useItemsModule, "useItem").mockReturnValue({
      data: { ...baseItem, units: 2 },
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItem>);
    lotsSpy = spyOn(useItemLotsModule, "useItemLots").mockReturnValue({
      data: [baseLot],
    } as unknown as ReturnType<typeof useItemLotsModule.useItemLots>);

    const { getByTestId } = render(<EditItemPage itemId="item-1" />, { wrapper: Wrapper });
    fireEvent.click(getByTestId("submit-form"));

    await waitFor(() => expect(updateLotMutateAsync).toHaveBeenCalled());

    expect(createLotMutateAsync).not.toHaveBeenCalled();
    expect(updateLotMutateAsync).toHaveBeenCalledWith({
      lotId: "lot-1",
      itemId: "item-1",
      values: {
        units: 3,
        opened_remaining: null,
        unit_price: null,
        purchase_date: null,
        expiry_date: null,
        store_name: null,
      },
      expected: { units: 2, opened_remaining: null },
    });
  });
});
