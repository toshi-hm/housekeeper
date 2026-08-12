import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import React from "react";

import * as useItemImageModule from "@/hooks/useItemImage";
import * as useItemsModule from "@/hooks/useItems";
import * as useTagsModule from "@/hooks/useTags";
import * as useUserSettingsModule from "@/hooks/useUserSettings";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";
import type { Item, ItemFormValues } from "@/types/item";

// ItemForm pulls in barcode scanning, image upload and master-data hooks that
// are irrelevant to the tests below, so it is replaced with a lightweight stub
// that surfaces `defaultValues.content_unit` and exposes a submit trigger plus
// a way to simulate a pending image selection.
const minimalFormValues: ItemFormValues = {
  name: "テスト商品",
  units: 1,
  content_amount: 1,
  content_unit: "個",
};

mock.module("@/components/organisms/ItemForm", () => ({
  ItemForm: ({
    defaultValues,
    onSubmit,
    onPendingFileChange,
    onBarcodeScanned,
    isSubmitting,
    disableContentAmount,
    extraFields,
  }: {
    defaultValues?: { content_unit?: string };
    onSubmit: (values: ItemFormValues) => void;
    onPendingFileChange?: (file: File | null) => void;
    onBarcodeScanned?: (barcode: string, source: "db" | "api" | null) => void;
    isSubmitting?: boolean;
    disableContentAmount?: boolean;
    extraFields?: React.ReactNode;
  }) => (
    <div>
      <div data-testid="content-unit">{defaultValues?.content_unit ?? ""}</div>
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
  ),
}));

// MultiTagSelect is a real component with its own data-fetching concerns;
// stub it with a button that selects a fixed tag id.
mock.module("@/components/molecules/MultiTagSelect", () => ({
  MultiTagSelect: ({ onChange }: { onChange: (ids: string[]) => void }) => (
    <button type="button" data-testid="select-tag" onClick={() => onChange(["tag-1"])}>
      select tag
    </button>
  ),
}));

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
