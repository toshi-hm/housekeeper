import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useItemLotsModule from "@/hooks/useItemLots";
import * as useItemsModule from "@/hooks/useItems";
import * as useMasterDataModule from "@/hooks/useMasterData";
import i18n from "@/lib/i18n";
import type { ReceiptDraftItem } from "@/types/receipt";

import { ReceiptReviewPanel } from "./ReceiptReviewPanel";

const draft: ReceiptDraftItem = {
  id: "d1",
  name: "牛乳",
  quantity: 1,
  unitPrice: 248,
  confidence: "high",
  categoryId: null,
  storageLocationId: null,
  expiryDate: null,
  included: true,
};

const Wrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
};

describe("ReceiptReviewPanel remove (#923)", () => {
  afterEach(() => {
    mock.restore();
  });

  // #923: bulk registration leaves a partially-failed row's status as
  // "failed" (see handleBulkRegister below), and previously nothing could
  // remove it from the review list. Exercise the real failure path (not a
  // hand-set status prop) to make sure removeDraft is reachable from a
  // genuinely failed row.
  test("a row that failed bulk registration can be removed from the list", async () => {
    spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
    spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useItemLotsModule.useStoreNameSuggestions>);
    spyOn(useItemsModule, "useCreateItem").mockReturnValue({
      mutateAsync: async () => {
        throw new Error("simulated registration failure");
      },
    } as unknown as ReturnType<typeof useItemsModule.useCreateItem>);

    const onDraftsChange = mock((drafts: ReceiptDraftItem[]) => drafts);
    const { findByRole } = render(
      <ReceiptReviewPanel
        drafts={[draft]}
        storeName={null}
        onDraftsChange={onDraftsChange}
        onStoreNameChange={() => {}}
        onDone={() => {}}
      />,
      { wrapper: Wrapper },
    );

    const bulkRegisterButton = await findByRole("button", {
      name: i18n.t("bulkRegister", { ns: "receiptScan", count: 1 }),
    });
    fireEvent.click(bulkRegisterButton);

    // Once mutateAsync rejects, the row's status flips to "failed" and
    // ReceiptLineItemRow now renders its delete button for that status too.
    const removeButton = await findByRole("button", {
      name: i18n.t("removeRow", { ns: "receiptScan" }),
    });
    fireEvent.click(removeButton);

    expect(onDraftsChange).toHaveBeenCalledWith([]);
  });
});
