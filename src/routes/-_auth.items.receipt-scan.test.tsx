import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import { I18nextProvider } from "react-i18next";

import * as useReceiptScanModule from "@/hooks/useReceiptScan";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

// Import routerContext via relative path (not in public package exports) to provide
// a minimal router stub so that useNavigate inside ReceiptScanPage doesn't throw
// (same approach as -_auth.items.$itemId.consume.test.tsx).
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { routerContext } from "../../node_modules/@tanstack/react-router/dist/esm/routerContext.js";
import { ReceiptScanPage } from "./_auth.items.receipt-scan";

const stubRouter = {
  navigate: () => Promise.resolve(),
  buildLocation: () => ({ href: "/" }),
  isServer: false,
  options: {},
  state: { location: { href: "/", pathname: "/" }, matches: [], pendingMatches: [] },
} as unknown as Parameters<typeof routerContext.Provider>[0]["value"];

const stubToast: ToastContextValue = { toasts: [], toast: () => "toast-id", dismiss: () => {} };

const Wrapper = ({ children }: { children: React.ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <routerContext.Provider value={stubRouter}>
          <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
        </routerContext.Provider>
      </QueryClientProvider>
    </I18nextProvider>
  );
};

const renderPage = () => render(<ReceiptScanPage />, { wrapper: Wrapper as React.ComponentType });

const selectReceiptFile = (container: HTMLElement) => {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["dummy-image-bytes"], "receipt.jpg", { type: "image/jpeg" });
  fireEvent.change(input, { target: { files: [file] } });
};

// #923: while step.kind === "scanning" (during the Edge Function's 25s
// window, receipt-scan.md §3.1), the user previously had no way out besides
// waiting. A cancel button must abort the in-flight request and return the
// user to the capture step.
describe("ReceiptScanPage scan cancellation (#923)", () => {
  afterEach(() => {
    mock.restore();
  });

  test("shows a cancel button while scanning, and cancelling aborts the request and returns to capture", async () => {
    let capturedSignal: AbortSignal | undefined;
    // A promise that never resolves on its own — this test verifies the UI
    // reacts to abort() directly, not to the mutation ever settling.
    const pending = new Promise<never>(() => {});
    spyOn(useReceiptScanModule, "useReceiptScan").mockReturnValue({
      mutateAsync: ({ signal }: { file: File; signal?: AbortSignal }) => {
        capturedSignal = signal;
        return pending;
      },
    } as unknown as ReturnType<typeof useReceiptScanModule.useReceiptScan>);

    const { container, getByRole, queryByRole } = renderPage();

    selectReceiptFile(container);

    const cancelButton = await waitFor(() =>
      getByRole("button", { name: i18n.t("cancel", { ns: "common" }) }),
    );
    expect(capturedSignal?.aborted).toBe(false);

    fireEvent.click(cancelButton);

    expect(capturedSignal?.aborted).toBe(true);
    // Back to the idle/capture step: the file input is available again, and
    // the cancel button (scanning-only) is gone.
    expect(queryByRole("button", { name: i18n.t("cancel", { ns: "common" }) })).toBeNull();
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });

  test("a late rejection from the aborted request does not show an error toast or re-trigger the idle transition", async () => {
    let rejectScan: ((err: unknown) => void) | undefined;
    spyOn(useReceiptScanModule, "useReceiptScan").mockReturnValue({
      mutateAsync: () =>
        new Promise((_resolve, reject) => {
          rejectScan = reject;
        }),
    } as unknown as ReturnType<typeof useReceiptScanModule.useReceiptScan>);
    const toastSpy = mock(() => "toast-id");
    const toastValue: ToastContextValue = { toasts: [], toast: toastSpy, dismiss: () => {} };
    const WrapperWithSpy = ({ children }: { children: React.ReactNode }) => {
      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      return (
        <I18nextProvider i18n={i18n}>
          <QueryClientProvider client={queryClient}>
            <routerContext.Provider value={stubRouter}>
              <ToastContext.Provider value={toastValue}>{children}</ToastContext.Provider>
            </routerContext.Provider>
          </QueryClientProvider>
        </I18nextProvider>
      );
    };

    const { container, getByRole } = render(<ReceiptScanPage />, {
      wrapper: WrapperWithSpy as React.ComponentType,
    });
    selectReceiptFile(container);
    const cancelButton = await waitFor(() =>
      getByRole("button", { name: i18n.t("cancel", { ns: "common" }) }),
    );
    fireEvent.click(cancelButton);

    // Simulate the in-flight request eventually rejecting with an AbortError
    // after the user already cancelled and the UI already moved on.
    rejectScan?.(new useReceiptScanModule.ReceiptScanError("cancelled"));
    await Promise.resolve();
    await Promise.resolve();

    expect(toastSpy).not.toHaveBeenCalled();
  });
});
