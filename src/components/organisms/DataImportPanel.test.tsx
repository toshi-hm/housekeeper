import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useImportItemsModule from "@/hooks/useImportItems";
import * as exportLib from "@/lib/export";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

import { DataImportPanel } from "./DataImportPanel";

const toastMock = mock<(message: string, variant?: "success" | "error") => void>(() => {});
const mutateMock = mock<(input: unknown, opts?: { onSuccess?: (result: unknown) => void }) => void>(
  () => {},
);

const wrapper = ({ children }: { children: ReactNode }) => {
  const stubToast: ToastContextValue = { toasts: [], toast: toastMock, dismiss: () => {} };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
      </I18nextProvider>
    </QueryClientProvider>
  );
};

const makeFile = (content: string, name = "backup.json"): File =>
  new File([content], name, { type: "application/json" });

describe("DataImportPanel", () => {
  beforeEach(() => {
    toastMock.mockClear();
    mutateMock.mockClear();

    spyOn(useImportItemsModule, "useImportItems").mockReturnValue({
      mutate: mutateMock,
      isPending: false,
    } as unknown as ReturnType<typeof useImportItemsModule.useImportItems>);
  });

  afterEach(() => {
    mock.restore();
  });

  it("selecting a valid backup file shows a preview with the item count", async () => {
    spyOn(exportLib, "jsonToItems").mockReturnValue([
      { name: "牛乳", units: 1, content_amount: 1000, content_unit: "mL" },
      { name: "卵", units: 1, content_amount: 10, content_unit: "個" },
    ] as exportLib.ImportItemInput[]);

    const { getByLabelText, getByText, container } = render(<DataImportPanel />, { wrapper });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile("{}")] } });

    await waitFor(() => expect(getByText("2 items found")).toBeTruthy());
    expect(getByLabelText(/matches an existing item/i)).toBeTruthy();
  });

  it("selecting an invalid JSON file shows an error toast and no preview", async () => {
    spyOn(exportLib, "jsonToItems").mockImplementation(() => {
      throw new exportLib.ImportParseError("invalid_json");
    });

    const { queryByText, container } = render(<DataImportPanel />, { wrapper });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile("not json")] } });

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.any(String), "error"));
    expect(queryByText(/found$/)).toBeNull();
  });

  it("selecting a well-formed-but-wrong-shape file reports the invalid_format error", async () => {
    spyOn(exportLib, "jsonToItems").mockImplementation(() => {
      throw new exportLib.ImportParseError("invalid_format");
    });

    const { container } = render(<DataImportPanel />, { wrapper });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile("{}")] } });

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        "This doesn't look like a Housekeeper backup file",
        "error",
      ),
    );
  });

  it("confirming the import calls the mutation with the parsed items and chosen strategy", async () => {
    const items = [
      { name: "牛乳", units: 1, content_amount: 1000, content_unit: "mL" },
    ] as exportLib.ImportItemInput[];
    spyOn(exportLib, "jsonToItems").mockReturnValue(items);

    const { getByRole, getByLabelText, container } = render(<DataImportPanel />, { wrapper });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile("{}")] } });

    await waitFor(() => expect(getByRole("button", { name: "Import" })).toBeTruthy());

    fireEvent.change(getByLabelText(/matches an existing item/i), {
      target: { value: "overwrite" },
    });
    fireEvent.click(getByRole("button", { name: "Import" }));

    // Confirmation dialog gates the actual mutation call.
    const confirmDialog = getByRole("alertdialog");
    fireEvent.click(
      Array.from(confirmDialog.querySelectorAll("button")).find(
        (b) => b.textContent === "Import",
      ) as HTMLElement,
    );

    expect(mutateMock).toHaveBeenCalledWith(
      { items, duplicateStrategy: "overwrite" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("moves focus back to the select-file button after a successful import (#698)", async () => {
    // userEvent (not fireEvent) is required here: fireEvent.click dispatches a
    // click event without moving real focus, so it can't reproduce the actual
    // bug — the confirm-dialog trigger button unmounting while it still holds
    // focus. userEvent.click focuses the element first, like a real click.
    const user = userEvent.setup();
    const items = [
      { name: "牛乳", units: 1, content_amount: 1000, content_unit: "mL" },
    ] as exportLib.ImportItemInput[];
    spyOn(exportLib, "jsonToItems").mockReturnValue(items);

    const { getByRole, container } = render(<DataImportPanel />, { wrapper });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile("{}")] } });

    await waitFor(() => expect(getByRole("button", { name: "Import" })).toBeTruthy());
    await user.click(getByRole("button", { name: "Import" }));

    const confirmDialog = getByRole("alertdialog");
    const confirmButton = Array.from(confirmDialog.querySelectorAll("button")).find(
      (b) => b.textContent === "Import",
    ) as HTMLElement;
    await user.click(confirmButton);

    const onSuccess = mutateMock.mock.calls[0]?.[1]?.onSuccess;
    act(() => {
      onSuccess?.({ createdCount: 1, updatedCount: 0, skippedCount: 0 });
    });

    const selectFileButton = getByRole("button", { name: "Select file" });
    // Compared as a boolean (not `.toBe(selectFileButton)`) so a failure
    // doesn't dump the entire DOM node tree into the test output.
    expect(document.activeElement === selectFileButton).toBe(true);
  });
});
