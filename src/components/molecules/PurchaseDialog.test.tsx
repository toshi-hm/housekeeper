import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, mock, spyOn } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useMasterDataModule from "../../hooks/useMasterData";
import i18n from "../../lib/i18n";
import { ToastContext, type ToastContextValue } from "../../lib/toast-context";
import { PurchaseDialog } from "./PurchaseDialog";

const stubToast: ToastContextValue = { toasts: [], toast: () => {}, dismiss: () => {} };

const makeWrapper =
  (queryClient: QueryClient) =>
  ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
      </I18nextProvider>
    </QueryClientProvider>
  );

describe("PurchaseDialog", () => {
  it("renders nothing when closed", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <PurchaseDialog open={false} onSubmit={() => {}} onClose={() => {}} />,
      { wrapper: makeWrapper(qc) },
    );
    expect(container.firstChild).toBeNull();
  });

  it("close button is enabled by default (isSubmitting=false)", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useCategories>);
    const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);

    const { getAllByRole } = render(
      <PurchaseDialog open={true} onSubmit={() => {}} onClose={() => {}} isSubmitting={false} />,
      { wrapper: makeWrapper(qc) },
    );

    const buttons = getAllByRole("button");
    const closeButton = buttons.find((b) => b.querySelector("svg.lucide-x"));
    expect(closeButton).toBeDefined();
    expect((closeButton as HTMLButtonElement).disabled).toBe(false);

    catSpy.mockRestore();
    locSpy.mockRestore();
  });

  it("close button is disabled when isSubmitting=true", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useCategories>);
    const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);

    const { getAllByRole } = render(
      <PurchaseDialog open={true} onSubmit={() => {}} onClose={() => {}} isSubmitting={true} />,
      { wrapper: makeWrapper(qc) },
    );

    const buttons = getAllByRole("button");
    const closeButton = buttons.find((b) => b.querySelector("svg.lucide-x"));
    expect(closeButton).toBeDefined();
    expect((closeButton as HTMLButtonElement).disabled).toBe(true);

    catSpy.mockRestore();
    locSpy.mockRestore();
  });

  it("close button has an accessible label", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useCategories>);
    const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);

    const { getByRole } = render(
      <PurchaseDialog open={true} onSubmit={() => {}} onClose={() => {}} isSubmitting={false} />,
      { wrapper: makeWrapper(qc) },
    );

    expect(getByRole("button", { name: i18n.t("common:close") })).toBeDefined();

    catSpy.mockRestore();
    locSpy.mockRestore();
  });

  it("calls onClose exactly once when the backdrop is clicked", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useCategories>);
    const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    const onClose = mock(() => {});

    const { container } = render(
      <PurchaseDialog open={true} onSubmit={() => {}} onClose={onClose} isSubmitting={false} />,
      { wrapper: makeWrapper(qc) },
    );

    fireEvent.click(container.firstChild as Element);
    expect(onClose).toHaveBeenCalledTimes(1);

    catSpy.mockRestore();
    locSpy.mockRestore();
  });

  it("does not call onClose when the dialog content is clicked", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useCategories>);
    const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    const onClose = mock(() => {});

    const { getByText } = render(
      <PurchaseDialog open={true} onSubmit={() => {}} onClose={onClose} isSubmitting={false} />,
      { wrapper: makeWrapper(qc) },
    );

    fireEvent.click(getByText(i18n.t("shopping:purchaseDialog")));
    expect(onClose).not.toHaveBeenCalled();

    catSpy.mockRestore();
    locSpy.mockRestore();
  });

  it("calls onClose exactly once when Escape is pressed", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useCategories>);
    const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    const onClose = mock(() => {});

    render(
      <PurchaseDialog open={true} onSubmit={() => {}} onClose={onClose} isSubmitting={false} />,
      { wrapper: makeWrapper(qc) },
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    catSpy.mockRestore();
    locSpy.mockRestore();
  });

  it("does not call onClose on Escape while isSubmitting", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const catSpy = spyOn(useMasterDataModule, "useCategories").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useCategories>);
    const locSpy = spyOn(useMasterDataModule, "useStorageLocations").mockReturnValue({
      data: [],
    } as ReturnType<typeof useMasterDataModule.useStorageLocations>);
    const onClose = mock(() => {});

    render(
      <PurchaseDialog open={true} onSubmit={() => {}} onClose={onClose} isSubmitting={true} />,
      { wrapper: makeWrapper(qc) },
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    catSpy.mockRestore();
    locSpy.mockRestore();
  });
});
