import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import React from "react";
import { I18nextProvider } from "react-i18next";

import * as useItemsModule from "@/hooks/useItems";
import i18n from "@/lib/i18n";
import type { Item } from "@/types/item";

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { ArchivedItemsPage } from "./ArchivedItemsPage";

const stubRouter = {
  navigate: () => Promise.resolve(),
  buildLocation: () => ({ href: "/" }),
  isServer: false,
  options: {},
  state: { location: { href: "/", pathname: "/" }, matches: [], pendingMatches: [] },
} as unknown as Parameters<typeof routerContext.Provider>[0]["value"];

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const [client] = React.useState(() => new QueryClient());
  return (
    <QueryClientProvider client={client}>
      <routerContext.Provider value={stubRouter}>
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
      </routerContext.Provider>
    </QueryClientProvider>
  );
};

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: "item-1",
  user_id: "user-1",
  name: "牛乳",
  barcode: null,
  category_id: null,
  storage_location_id: null,
  units: 0,
  content_amount: 1,
  content_unit: "個",
  opened_remaining: null,
  purchase_date: null,
  expiry_date: null,
  notes: null,
  image_path: "user-1/item-1.webp",
  deleted_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...overrides,
});

describe("ArchivedItemsPage — 完全削除（パージ）(#1099)", () => {
  let restoreMutate: ReturnType<typeof mock>;
  let purgeMutate: ReturnType<typeof mock>;

  beforeEach(() => {
    spyOn(useItemsModule, "useDeletedItems").mockReturnValue({
      data: [makeItem()],
      isLoading: false,
    } as unknown as ReturnType<typeof useItemsModule.useDeletedItems>);

    restoreMutate = mock(() => {});
    spyOn(useItemsModule, "useRestoreItem").mockReturnValue({
      mutate: restoreMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useItemsModule.useRestoreItem>);

    purgeMutate = mock(() => {});
    spyOn(useItemsModule, "useDeleteItemPermanently").mockReturnValue({
      mutate: purgeMutate,
      isPending: false,
    } as unknown as ReturnType<typeof useItemsModule.useDeleteItemPermanently>);
  });

  afterEach(() => {
    cleanup();
  });

  it("完全に削除ボタンを押すと確認ダイアログが表示され、ハードデリートはまだ実行されない", () => {
    const { getByRole, getByText } = render(<ArchivedItemsPage />, { wrapper: Wrapper });

    fireEvent.click(getByRole("button", { name: i18n.t("settings:purgeItem") }));

    expect(getByRole("alertdialog")).toBeTruthy();
    expect(getByText(i18n.t("settings:purgeItemConfirmTitle"))).toBeTruthy();
    // 破壊的操作である旨（「元に戻せない」）が確認文言から読み取れること
    expect(getByText(i18n.t("settings:purgeItemConfirmMessage", { name: "牛乳" }))).toBeTruthy();
    expect(purgeMutate).not.toHaveBeenCalled();
  });

  it("確認ダイアログで確定すると、対象アイテムのid/画像パスでハードデリートmutationを呼ぶ", async () => {
    const { getByRole } = render(<ArchivedItemsPage />, { wrapper: Wrapper });

    fireEvent.click(getByRole("button", { name: i18n.t("settings:purgeItem") }));

    const dialog = getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: i18n.t("settings:purgeItem") }));

    await waitFor(() => expect(purgeMutate).toHaveBeenCalled());

    expect(purgeMutate).toHaveBeenCalledWith(
      { id: "item-1", imagePath: "user-1/item-1.webp" },
      expect.anything(),
    );
  });

  it("キャンセルするとダイアログが閉じ、ハードデリートは呼ばれない", () => {
    const { getByRole, queryByRole } = render(<ArchivedItemsPage />, { wrapper: Wrapper });

    fireEvent.click(getByRole("button", { name: i18n.t("settings:purgeItem") }));
    fireEvent.click(getByRole("button", { name: i18n.t("cancel") }));

    expect(queryByRole("alertdialog")).toBeNull();
    expect(purgeMutate).not.toHaveBeenCalled();
  });

  it("復元ボタンは完全削除ボタンと独立して動作する", () => {
    const { getByRole } = render(<ArchivedItemsPage />, { wrapper: Wrapper });

    fireEvent.click(getByRole("button", { name: i18n.t("settings:restore") }));

    expect(restoreMutate).toHaveBeenCalledWith("item-1");
    expect(purgeMutate).not.toHaveBeenCalled();
  });
});
