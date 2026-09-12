import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import React from "react";
import { I18nextProvider } from "react-i18next";

import * as MultiTagSelectModule from "@/components/molecules/MultiTagSelect";
import * as ItemFormModule from "@/components/organisms/ItemForm";
import * as useConsumeItemModule from "@/hooks/useConsumeItem";
import * as useItemImageModule from "@/hooks/useItemImage";
import * as useItemLotsModule from "@/hooks/useItemLots";
import * as useItemsModule from "@/hooks/useItems";
import * as useTagsModule from "@/hooks/useTags";
import * as useUserSettingsModule from "@/hooks/useUserSettings";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";
import type { Item, ItemFormValues } from "@/types/item";

// ItemForm pulls in barcode scanning, image upload and master-data hooks that
// are irrelevant to the tests below, so it is replaced with a lightweight stub
// that surfaces `defaultValues.content_unit` and exposes a submit trigger plus
// a way to simulate a pending image selection.
//
// Uses spyOn(module, "ItemForm").mockImplementation(...) rather than
// mock.module(): mock.module() swaps the module registry entry for
// "@/components/organisms/ItemForm" itself, which is process-wide and not
// scoped to this file (see the same caveat documented in
// InventoryChatPanel.focusTrap.test.tsx and useConsumeItem.test.ts). Since
// ItemForm.test.tsx imports and exercises the *real* ItemForm in the same
// bun:test process, a mock.module() replacement here can — depending on file
// execution order, which is not guaranteed to match local runs — leak into
// that file and silently replace the real component under test with this
// stub (#837 CI failure). spyOn + mockRestore in beforeEach/afterEach keeps
// the replacement scoped to exactly the tests below.
const minimalFormValues: ItemFormValues = {
  name: "テスト商品",
  units: 1,
  content_amount: 1,
  content_unit: "個",
};

const StubItemForm = ({
  defaultValues,
  onSubmit,
  onPendingFileChange,
  onBarcodeScanned,
  isSubmitting,
  disableContentAmount,
  extraFields,
}: {
  defaultValues?: { content_unit?: string; name?: string };
  onSubmit: (values: ItemFormValues) => void;
  onPendingFileChange?: (file: File | null) => void;
  onBarcodeScanned?: (barcode: string, source: "db" | "api" | null) => void;
  isSubmitting?: boolean;
  disableContentAmount?: boolean;
  extraFields?: React.ReactNode;
}) => (
  <div>
    <div data-testid="content-unit">{defaultValues?.content_unit ?? ""}</div>
    <div data-testid="prefill-name">{defaultValues?.name ?? ""}</div>
    <div data-testid="is-submitting">{String(Boolean(isSubmitting))}</div>
    <div data-testid="disable-content-amount">{String(Boolean(disableContentAmount))}</div>
    {extraFields}
    <button
      type="button"
      data-testid="select-pending-file"
      onClick={() => onPendingFileChange?.(new File(["x"], "photo.jpg"))}
    >
      select file
    </button>
    <button
      type="button"
      data-testid="scan-barcode"
      onClick={() => void onBarcodeScanned?.("4901234567890", "db")}
    >
      scan barcode
    </button>
    <button type="button" data-testid="submit-form" onClick={() => onSubmit(minimalFormValues)}>
      submit
    </button>
  </div>
);

// MultiTagSelect is a real component with its own data-fetching concerns;
// stub it with a button that selects a fixed tag id. Spied for the same
// leak-avoidance reason as ItemForm above.
const StubMultiTagSelect = ({ onChange }: { onChange: (ids: string[]) => void }) => (
  <button type="button" data-testid="select-tag" onClick={() => onChange(["tag-1"])}>
    select tag
  </button>
);

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
});

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { NewItemPage } from "./NewItemPage";

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

// QuickConsumeSheet (unlike the stubbed ItemForm above) is exercised as the
// real component below, so its `t()` calls need an actual i18n instance to
// render matchable text instead of raw keys.
const WrapperWithI18n = ({ children }: { children: React.ReactNode }) => (
  <I18nextProvider i18n={i18n}>
    <Wrapper>{children}</Wrapper>
  </I18nextProvider>
);

describe("NewItemPage - default content unit", () => {
  let itemSpy: ReturnType<typeof spyOn>;
  let settingsSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    itemSpy = spyOn(useItemsModule, "useItem").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItem>);

    spyOn(useItemsModule, "useCreateItem").mockReturnValue({
      mutateAsync: async () => ({}) as Item,
      isPending: false,
    } as unknown as ReturnType<typeof useItemsModule.useCreateItem>);
  });

  afterEach(() => {
    itemSpy.mockRestore();
    settingsSpy.mockRestore();
    cleanup();
  });

  it("passes the user's default_unit as the initial content unit", () => {
    settingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: { default_unit: "kg" },
      isLoading: false,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);

    const { getByTestId } = render(<NewItemPage />, { wrapper: Wrapper });

    expect(getByTestId("content-unit").textContent).toBe("kg");
  });

  it("leaves content unit unset when the user has no default_unit configured", () => {
    settingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);

    const { getByTestId } = render(<NewItemPage />, { wrapper: Wrapper });

    expect(getByTestId("content-unit").textContent).toBe("");
  });

  it("does not render the form until user settings finish loading, to avoid missing default_unit", () => {
    settingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);

    const { queryByTestId } = render(<NewItemPage />, { wrapper: Wrapper });

    expect(queryByTestId("content-unit")).toBeNull();
  });
});

describe("NewItemPage - シェルフスキャンからの商品名プリフィル (#1027)", () => {
  let itemSpy: ReturnType<typeof spyOn>;
  let settingsSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    itemSpy = spyOn(useItemsModule, "useItem").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItem>);

    settingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);

    spyOn(useItemsModule, "useCreateItem").mockReturnValue({
      mutateAsync: async () => ({}) as Item,
      isPending: false,
    } as unknown as ReturnType<typeof useItemsModule.useCreateItem>);
  });

  afterEach(() => {
    itemSpy.mockRestore();
    settingsSpy.mockRestore();
    cleanup();
  });

  it("prefillName を渡すと商品名の初期値として引き継がれる", () => {
    const { getByTestId } = render(<NewItemPage prefillName="醤油" />, { wrapper: Wrapper });

    expect(getByTestId("prefill-name").textContent).toBe("醤油");
  });

  it("prefillName 未指定時は商品名を空のまま初期化する", () => {
    const { getByTestId } = render(<NewItemPage />, { wrapper: Wrapper });

    expect(getByTestId("prefill-name").textContent).toBe("");
  });

  it("cloneFrom 指定時は prefillName より clone元の商品名を優先する", () => {
    itemSpy.mockReturnValue({
      data: { id: "item-1", name: "クローン元", content_amount: 1, content_unit: "個" },
      isLoading: false,
    } as unknown as ReturnType<typeof useItemsModule.useItem>);

    const { getByTestId } = render(<NewItemPage cloneFrom="item-1" prefillName="醤油" />, {
      wrapper: Wrapper,
    });

    expect(getByTestId("prefill-name").textContent).toBe("クローン元");
  });
});

describe("NewItemPage - location suggestion wiring (#814)", () => {
  let itemSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    itemSpy = spyOn(useItemsModule, "useItem").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItem>);

    spyOn(useItemsModule, "useCreateItem").mockReturnValue({
      mutateAsync: async () => ({}) as Item,
      isPending: false,
    } as unknown as ReturnType<typeof useItemsModule.useCreateItem>);

    spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);
  });

  afterEach(() => {
    itemSpy.mockRestore();
    cleanup();
  });

  it("enables location suggestion on the new-item form", () => {
    render(<NewItemPage />, { wrapper: Wrapper });

    // #814: toHaveBeenCalledWith(expect.objectContaining(...)) against the
    // full ItemForm props object (which includes React elements, refs, and
    // closures via extraFields/onSubmit/etc.) makes bun:test's matcher hang
    // while formatting/diffing the call — read the one prop we care about
    // directly from the mock's recorded call args instead.
    const lastCallProps = itemFormSpy.mock.calls.at(-1)?.[0] as
      | { enableLocationSuggestion?: boolean }
      | undefined;
    expect(lastCallProps?.enableLocationSuggestion).toBe(true);
  });
});

// #929 セルフレビューの追従: EditItemPage / PurchaseDialog と同じ穴が cloneFrom にも
// あった — clone 元アイテムの item_type（個別上書き）が cloneDefaultValues に渡されて
// おらず、クローンすると null（カテゴリ追従）に戻ってしまっていた。
describe("NewItemPage - clone carries item_type (#929 follow-up)", () => {
  let itemSpy: ReturnType<typeof spyOn>;
  let settingsSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    settingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);
  });

  afterEach(() => {
    itemSpy.mockRestore();
    settingsSpy.mockRestore();
    cleanup();
  });

  it("clone元の個別上書きされた item_type を defaultValues に引き継ぐ", () => {
    itemSpy = spyOn(useItemsModule, "useItem").mockReturnValue({
      data: { id: "item-1", item_type: "daily_goods" } as Item,
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItem>);

    render(<NewItemPage cloneFrom="item-1" />, { wrapper: Wrapper });

    const lastCallProps = itemFormSpy.mock.calls.at(-1)?.[0] as
      | { defaultValues?: { item_type?: string | null } }
      | undefined;
    expect(lastCallProps?.defaultValues?.item_type).toBe("daily_goods");
  });

  it("clone元が個別指定なし（追従）のときは null を引き継ぐ", () => {
    itemSpy = spyOn(useItemsModule, "useItem").mockReturnValue({
      data: { id: "item-1", item_type: null } as unknown as Item,
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItem>);

    render(<NewItemPage cloneFrom="item-1" />, { wrapper: Wrapper });

    const lastCallProps = itemFormSpy.mock.calls.at(-1)?.[0] as
      | { defaultValues?: { item_type?: string | null } }
      | undefined;
    expect(lastCallProps?.defaultValues?.item_type).toBeNull();
  });
});

// #650: a revived (un-soft-deleted) item is an *existing* item, just like a
// stacked one — selecting a new image/tag on the form must not overwrite the
// values it already had before it was deleted.
describe("NewItemPage - existing item overwrite guard (#650)", () => {
  let itemSpy: ReturnType<typeof spyOn>;
  let settingsSpy: ReturnType<typeof spyOn>;
  let setItemTagsSpy: ReturnType<typeof spyOn>;
  let uploadItemImageSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    itemSpy = spyOn(useItemsModule, "useItem").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItem>);
    settingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);
    setItemTagsSpy = spyOn(useTagsModule, "setItemTags").mockResolvedValue(undefined);
    uploadItemImageSpy = spyOn(useItemImageModule, "uploadItemImage").mockResolvedValue(
      undefined as never,
    );
  });

  afterEach(() => {
    itemSpy.mockRestore();
    settingsSpy.mockRestore();
    setItemTagsSpy.mockRestore();
    uploadItemImageSpy.mockRestore();
    cleanup();
  });

  const renderAndSubmit = async (
    mutateResult: Item & { _stacked?: boolean; _revived?: boolean },
  ) => {
    spyOn(useItemsModule, "useCreateItem").mockReturnValue({
      mutateAsync: async () => mutateResult,
      isPending: false,
    } as unknown as ReturnType<typeof useItemsModule.useCreateItem>);

    const { getByTestId } = render(<NewItemPage />, { wrapper: Wrapper });
    fireEvent.click(getByTestId("select-tag"));
    fireEvent.click(getByTestId("select-pending-file"));
    fireEvent.click(getByTestId("submit-form"));
    await waitFor(() => expect(getByTestId("is-submitting").textContent).toBe("false"));
  };

  it("does not overwrite image/tags for a brand new item (no flags)", async () => {
    await renderAndSubmit({ id: "item-1" } as Item);

    expect(setItemTagsSpy).toHaveBeenCalledWith("item-1", ["tag-1"]);
    expect(uploadItemImageSpy).toHaveBeenCalled();
  });

  it("does not overwrite image/tags when the barcode stacked onto an active item", async () => {
    await renderAndSubmit({ id: "item-2", _stacked: true } as Item & { _stacked: true });

    expect(setItemTagsSpy).not.toHaveBeenCalled();
    expect(uploadItemImageSpy).not.toHaveBeenCalled();
  });

  it("does not overwrite image/tags when a soft-deleted item was revived", async () => {
    await renderAndSubmit({ id: "item-3", _revived: true } as Item & { _revived: true });

    expect(setItemTagsSpy).not.toHaveBeenCalled();
    expect(uploadItemImageSpy).not.toHaveBeenCalled();
  });
});

// #833: scanning a barcode that matches an in-stock item switches the page into
// "stack a new lot" mode. tryStackToActiveItem always interprets the new lot
// using the *existing* item's content_amount, so letting the form's content
// amount field stay editable here would let the user type a value that gets
// silently discarded on save (unlike EditItemPage, which already locks it via
// disableContentAmount for items that have lots, #742).
describe("NewItemPage - locks content amount while stacking onto a scanned item (#833)", () => {
  let itemSpy: ReturnType<typeof spyOn>;
  let settingsSpy: ReturnType<typeof spyOn>;
  let findActiveItemSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    itemSpy = spyOn(useItemsModule, "useItem").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItem>);
    settingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);
    spyOn(useItemsModule, "useCreateItem").mockReturnValue({
      mutateAsync: async () => ({}) as Item,
      isPending: false,
    } as unknown as ReturnType<typeof useItemsModule.useCreateItem>);
  });

  afterEach(() => {
    itemSpy.mockRestore();
    settingsSpy.mockRestore();
    findActiveItemSpy.mockRestore();
    cleanup();
  });

  it("disables content amount once a scanned barcode matches an in-stock item", async () => {
    findActiveItemSpy = spyOn(useItemsModule, "findActiveItemByBarcode").mockResolvedValue({
      id: "item-existing",
      name: "醤油",
      units: 1,
      content_amount: 1000,
      content_unit: "mL",
      opened_remaining: null,
      barcode: "4901234567890",
    } as Item);

    const { getByTestId } = render(<NewItemPage />, { wrapper: Wrapper });
    expect(getByTestId("disable-content-amount").textContent).toBe("false");

    fireEvent.click(getByTestId("scan-barcode"));

    await waitFor(() => expect(getByTestId("disable-content-amount").textContent).toBe("true"));
  });

  it("leaves content amount editable when the scanned barcode has no in-stock match", async () => {
    findActiveItemSpy = spyOn(useItemsModule, "findActiveItemByBarcode").mockResolvedValue(null);

    const { getByTestId } = render(<NewItemPage />, { wrapper: Wrapper });

    fireEvent.click(getByTestId("scan-barcode"));

    await waitFor(() => expect(findActiveItemSpy).toHaveBeenCalled());
    expect(getByTestId("disable-content-amount").textContent).toBe("false");
  });
});

// #924: scanning a barcode that matches an in-stock item opens QuickConsumeSheet
// instead of only the passive AlreadyInStockBanner, offering a one-tap "consume
// 1" shortcut that delegates to the existing consumeLot/consumeItem mutations
// (docs/specs/features/quick-consume.md).
describe("NewItemPage - quick consume sheet on barcode match (#924)", () => {
  let itemSpy: ReturnType<typeof spyOn>;
  let settingsSpy: ReturnType<typeof spyOn>;
  let findActiveItemSpy: ReturnType<typeof spyOn>;
  let itemLotsSpy: ReturnType<typeof spyOn>;
  let consumeLotSpy: ReturnType<typeof spyOn>;
  let consumeItemSpy: ReturnType<typeof spyOn>;
  let consumeLotMutateAsync: ReturnType<typeof mock>;
  let consumeItemMutateAsync: ReturnType<typeof mock>;

  const matchedItem = {
    id: "item-existing",
    name: "醤油",
    units: 1,
    content_amount: 1000,
    content_unit: "mL",
    opened_remaining: null,
    barcode: "4901234567890",
  } as Item;

  const mockLots = (data: unknown[]) => {
    itemLotsSpy = spyOn(useItemLotsModule, "useItemLots").mockReturnValue({
      data,
      isLoading: false,
    } as unknown as ReturnType<typeof useItemLotsModule.useItemLots>);
  };

  beforeEach(() => {
    itemSpy = spyOn(useItemsModule, "useItem").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useItemsModule.useItem>);
    settingsSpy = spyOn(useUserSettingsModule, "useUserSettings").mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof useUserSettingsModule.useUserSettings>);
    spyOn(useItemsModule, "useCreateItem").mockReturnValue({
      mutateAsync: async () => ({}) as Item,
      isPending: false,
    } as unknown as ReturnType<typeof useItemsModule.useCreateItem>);

    consumeLotMutateAsync = mock(async () => ({}) as never);
    consumeItemMutateAsync = mock(async () => ({}) as never);
    consumeLotSpy = spyOn(useItemLotsModule, "useConsumeLot").mockReturnValue({
      mutateAsync: consumeLotMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useItemLotsModule.useConsumeLot>);
    consumeItemSpy = spyOn(useConsumeItemModule, "useConsumeItem").mockReturnValue({
      mutateAsync: consumeItemMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useConsumeItemModule.useConsumeItem>);
  });

  afterEach(() => {
    itemSpy.mockRestore();
    settingsSpy.mockRestore();
    findActiveItemSpy.mockRestore();
    itemLotsSpy.mockRestore();
    consumeLotSpy.mockRestore();
    consumeItemSpy.mockRestore();
    cleanup();
  });

  it("opens the quick-consume sheet (not just the stack banner) when a scanned barcode matches an in-stock item", async () => {
    findActiveItemSpy = spyOn(useItemsModule, "findActiveItemByBarcode").mockResolvedValue(
      matchedItem,
    );
    mockLots([]);

    const { getByTestId, findByRole } = render(<NewItemPage />, { wrapper: WrapperWithI18n });
    fireEvent.click(getByTestId("scan-barcode"));

    const dialog = await findByRole("dialog");
    expect(dialog.textContent).toContain("醤油");
  });

  it("does not open the quick-consume sheet when the scanned barcode has no in-stock match", async () => {
    findActiveItemSpy = spyOn(useItemsModule, "findActiveItemByBarcode").mockResolvedValue(null);
    mockLots([]);

    const { getByTestId, queryByRole } = render(<NewItemPage />, { wrapper: WrapperWithI18n });
    fireEvent.click(getByTestId("scan-barcode"));

    await waitFor(() => expect(findActiveItemSpy).toHaveBeenCalled());
    expect(queryByRole("dialog")).toBeNull();
  });

  it("delegates '1点使う' to consumeLot with the FEFO (earliest expiry_date) lot", async () => {
    findActiveItemSpy = spyOn(useItemsModule, "findActiveItemByBarcode").mockResolvedValue(
      matchedItem,
    );
    const soonExpiringLot = {
      id: "lot-soon",
      item_id: "item-existing",
      units: 1,
      opened_remaining: null,
      expiry_date: "2026-01-01",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const laterExpiringLot = {
      id: "lot-later",
      item_id: "item-existing",
      units: 1,
      opened_remaining: null,
      expiry_date: "2026-02-01",
      created_at: "2026-02-01T00:00:00.000Z",
    };
    mockLots([laterExpiringLot, soonExpiringLot]);

    const { getByTestId, findByRole } = render(<NewItemPage />, { wrapper: WrapperWithI18n });
    fireEvent.click(getByTestId("scan-barcode"));
    const dialog = await findByRole("dialog");
    fireEvent.click(within(dialog).getByText(/1点使う|Use 1 \(/));

    await waitFor(() => expect(consumeLotMutateAsync).toHaveBeenCalledTimes(1));
    const call = consumeLotMutateAsync.mock.calls[0]?.[0] as { lot: { id: string } };
    expect(call.lot.id).toBe("lot-soon");
    expect(consumeItemMutateAsync).not.toHaveBeenCalled();
  });

  it("falls back to consumeItem directly when the matched item has no lots yet", async () => {
    findActiveItemSpy = spyOn(useItemsModule, "findActiveItemByBarcode").mockResolvedValue(
      matchedItem,
    );
    mockLots([]);

    const { getByTestId, findByRole } = render(<NewItemPage />, { wrapper: WrapperWithI18n });
    fireEvent.click(getByTestId("scan-barcode"));
    const dialog = await findByRole("dialog");
    fireEvent.click(within(dialog).getByText(/1点使う|Use 1 \(/));

    await waitFor(() => expect(consumeItemMutateAsync).toHaveBeenCalledTimes(1));
    expect(consumeLotMutateAsync).not.toHaveBeenCalled();
  });

  // A mistaken "1点使う" tap (wrong item scanned, or meant to tap "一部使用")
  // must be reversible like every other quick-consume entry point in the app
  // (dashboard's handleQuickConsume, useCalendarConsume — both via
  // useUndoableAction, #478). Regression test for the review finding that
  // this entry point originally showed a plain, non-undoable toast.
  it("shows an Undo-able toast (not a plain one) after '1点使う', matching the dashboard's quick-consume", async () => {
    findActiveItemSpy = spyOn(useItemsModule, "findActiveItemByBarcode").mockResolvedValue(
      matchedItem,
    );
    mockLots([]);
    consumeItemMutateAsync = mock(
      async () =>
        ({
          _undo: {
            kind: "direct",
            itemId: matchedItem.id,
            unitsBefore: 1,
            openedRemainingBefore: null,
            openedAtBefore: null,
            logId: null,
          },
        }) as never,
    );
    consumeItemSpy = spyOn(useConsumeItemModule, "useConsumeItem").mockReturnValue({
      mutateAsync: consumeItemMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useConsumeItemModule.useConsumeItem>);

    const toastMock = mock(() => "toast-id");
    const WrapperWithUndoableToast = ({ children }: { children: React.ReactNode }) => (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={new QueryClient()}>
          <routerContext.Provider value={stubRouter}>
            <ToastContext.Provider value={{ toasts: [], toast: toastMock, dismiss: () => {} }}>
              {children}
            </ToastContext.Provider>
          </routerContext.Provider>
        </QueryClientProvider>
      </I18nextProvider>
    );

    const { getByTestId, findByRole } = render(<NewItemPage />, {
      wrapper: WrapperWithUndoableToast,
    });
    fireEvent.click(getByTestId("scan-barcode"));
    const dialog = await findByRole("dialog");
    fireEvent.click(within(dialog).getByText(/1点使う|Use 1 \(/));

    await waitFor(() => expect(toastMock).toHaveBeenCalled());
    const [message, , options] = toastMock.mock.calls[0] as [
      string,
      string,
      { action?: { label: string } },
    ];
    expect(message).toContain(matchedItem.name);
    expect(options?.action?.label).toBeTruthy();
  });

  it("dismisses the sheet via the escape link without clearing the stack-banner state", async () => {
    findActiveItemSpy = spyOn(useItemsModule, "findActiveItemByBarcode").mockResolvedValue(
      matchedItem,
    );
    mockLots([]);

    const { getByTestId, findByRole, queryByRole } = render(<NewItemPage />, {
      wrapper: WrapperWithI18n,
    });
    fireEvent.click(getByTestId("scan-barcode"));
    const dialog = await findByRole("dialog");
    fireEvent.click(within(dialog).getByText(/新規登録として追加する|Add as a new item instead/));

    await waitFor(() => expect(queryByRole("dialog")).toBeNull());
    // AlreadyInStockBanner / disableContentAmount is driven by `existingItem`,
    // which the escape link must not clear (#924).
    expect(getByTestId("disable-content-amount").textContent).toBe("true");
  });
});
