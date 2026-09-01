import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor, within } from "@testing-library/react";
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

  // #960: handleBulkRegister closes over `drafts` when the loop starts, so a
  // row removed mid-loop (now possible for "failed" rows per the fix above)
  // was silently resurrected by the loop's own final onDraftsChange call,
  // which filtered the *stale* drafts snapshot instead of the current one.
  test("a row removed mid-bulk-registration is not resurrected once the loop finishes", async () => {
    const draftA: ReceiptDraftItem = { ...draft, id: "d1", name: "牛乳" };
    const draftB: ReceiptDraftItem = { ...draft, id: "d2", name: "パン" };

    spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useMasterDataModule.useCategories>);
    spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    spyOn(useItemLotsModule, "useStoreNameSuggestions").mockReturnValue({
      data: [],
    } as unknown as ReturnType<typeof useItemLotsModule.useStoreNameSuggestions>);

    let resolveB: () => void = () => {};
    const bGate = new Promise<void>((resolve) => {
      resolveB = resolve;
    });
    spyOn(useItemsModule, "useCreateItem").mockReturnValue({
      mutateAsync: async ({ values }: { values: { name: string } }) => {
        if (values.name === draftA.name) throw new Error("simulated registration failure");
        await bGate;
      },
    } as unknown as ReturnType<typeof useItemsModule.useCreateItem>);

    let currentDrafts: ReceiptDraftItem[] = [draftA, draftB];
    const onDraftsChange = mock((next: ReceiptDraftItem[]) => {
      currentDrafts = next;
    });

    const { findByRole, findByDisplayValue, rerender } = render(
      <ReceiptReviewPanel
        drafts={currentDrafts}
        storeName={null}
        onDraftsChange={onDraftsChange}
        onStoreNameChange={() => {}}
        onDone={() => {}}
      />,
      { wrapper: Wrapper },
    );

    const bulkRegisterButton = await findByRole("button", {
      name: i18n.t("bulkRegister", { ns: "receiptScan", count: 2 }),
    });
    fireEvent.click(bulkRegisterButton);

    // draftA fails first (its mutateAsync rejects immediately); the user
    // deletes it from the review list while draftB is still in flight.
    // Scope the query to draftA's own row (found via its name input) —
    // draftB's row also shows a remove button while it's still "pending",
    // so an unscoped findByRole("button", { name: removeRow }) can
    // ambiguously resolve to draftB's button in the brief window before
    // the bulk-register loop reaches it.
    const nameInputA = await findByDisplayValue(draftA.name);
    const rowA = nameInputA.closest(".rounded-lg");
    if (!rowA) throw new Error("draftA row container not found");
    await waitFor(() => {
      expect(
        within(rowA as HTMLElement).getByRole("button", {
          name: i18n.t("removeRow", { ns: "receiptScan" }),
        }),
      ).toBeTruthy();
    });
    const removeButtonA = within(rowA as HTMLElement).getByRole("button", {
      name: i18n.t("removeRow", { ns: "receiptScan" }),
    });
    fireEvent.click(removeButtonA);
    expect(currentDrafts.find((d) => d.id === draftA.id)).toBeUndefined();
    // Feed the updated (parent-owned) drafts prop back in, as a real
    // controlled parent would after onDraftsChange updates its own state.
    rerender(
      <ReceiptReviewPanel
        drafts={currentDrafts}
        storeName={null}
        onDraftsChange={onDraftsChange}
        onStoreNameChange={() => {}}
        onDone={() => {}}
      />,
    );

    // Let draftB's registration finish, ending the bulk-register loop.
    resolveB();

    await waitFor(() => {
      expect(currentDrafts.find((d) => d.id === draftB.id)).toBeUndefined();
    });
    // draftA must stay removed — it must not reappear from the loop's own
    // final onDraftsChange call filtering a stale `drafts` snapshot.
    expect(currentDrafts.find((d) => d.id === draftA.id)).toBeUndefined();
  });
});
