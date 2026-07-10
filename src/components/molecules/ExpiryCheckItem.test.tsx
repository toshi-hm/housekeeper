import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "../../lib/i18n";
import { ToastContext, type ToastContextValue } from "../../lib/toast-context";
import { ExpiryCheckItem } from "./ExpiryCheckItem";

const baseItem = {
  id: "item-1",
  user_id: "user-1",
  name: "牛乳 1L",
  barcode: null,
  category_id: null,
  storage_location_id: null,
  units: 1,
  content_amount: 1,
  content_unit: "個",
  opened_remaining: null,
  purchase_date: null,
  expiry_date: "2026-05-20",
  image_path: null,
  notes: null,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
  deleted_at: null,
};

const makeWrapper =
  (stubToast: ToastContextValue) =>
  ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={i18n}>
      <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
    </I18nextProvider>
  );

const makeStubToast = (): ToastContextValue & { calls: { message: string; variant: string }[] } => {
  const calls: { message: string; variant: string }[] = [];
  return {
    toasts: [],
    toast: (message, variant = "default") => calls.push({ message, variant }),
    dismiss: () => {},
    calls,
  };
};

describe("ExpiryCheckItem", () => {
  it("renders item name and expiry date", () => {
    const stub = makeStubToast();
    const { getByText, getByLabelText } = render(
      <ExpiryCheckItem item={baseItem} onCheck={async () => {}} />,
      { wrapper: makeWrapper(stub) },
    );
    expect(getByText("牛乳 1L")).toBeDefined();
    expect(getByLabelText("牛乳 1L")).toBeDefined();
  });

  it("renders without expiry date label when expiry_date is null", () => {
    const stub = makeStubToast();
    const item = { ...baseItem, expiry_date: null };
    const { getByText, queryByText } = render(
      <ExpiryCheckItem item={item} onCheck={async () => {}} />,
      { wrapper: makeWrapper(stub) },
    );
    expect(getByText("牛乳 1L")).toBeDefined();
    // No date text should appear
    expect(queryByText(/\d+月/)).toBeNull();
  });

  it("checks the checkbox and calls onCheck on click", async () => {
    const onCheck = mock(async () => {});
    const stub = makeStubToast();
    const { getByLabelText } = render(<ExpiryCheckItem item={baseItem} onCheck={onCheck} />, {
      wrapper: makeWrapper(stub),
    });
    const checkbox = getByLabelText("牛乳 1L") as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    await waitFor(() => expect(onCheck).toHaveBeenCalledTimes(1));
    expect(checkbox.checked).toBe(true);
  });

  it("resets checkbox and shows error toast when onCheck throws", async () => {
    const onCheck = mock(async () => {
      throw new Error("network error");
    });
    const stub = makeStubToast();
    const { getByLabelText } = render(<ExpiryCheckItem item={baseItem} onCheck={onCheck} />, {
      wrapper: makeWrapper(stub),
    });
    const checkbox = getByLabelText("牛乳 1L") as HTMLInputElement;
    fireEvent.click(checkbox);
    await waitFor(() => expect(stub.calls.length).toBe(1));
    expect(checkbox.checked).toBe(false);
    expect(stub.calls[0]?.variant).toBe("error");
  });

  it("does not call onCheck a second time while processing", async () => {
    let resolve!: () => void;
    const onCheck = mock(
      () =>
        new Promise<void>((res) => {
          resolve = res;
        }),
    );
    const stub = makeStubToast();
    const { getByLabelText } = render(<ExpiryCheckItem item={baseItem} onCheck={onCheck} />, {
      wrapper: makeWrapper(stub),
    });
    const checkbox = getByLabelText("牛乳 1L") as HTMLInputElement;
    fireEvent.click(checkbox);
    fireEvent.click(checkbox);
    resolve();
    await waitFor(() => expect(onCheck).toHaveBeenCalledTimes(1));
  });
});

describe("ExpiryCheckItem (不正な日付文字列の分岐)", () => {
  it("expiry_date が不完全でもフォールバックして描画する", () => {
    const stub = makeStubToast();
    const { container } = render(
      <ExpiryCheckItem
        item={{ ...baseItem, expiry_date: "2026" }}
        categoryColor={null}
        onCheck={() => Promise.resolve()}
      />,
      { wrapper: makeWrapper(stub) },
    );
    expect(container.textContent).toContain("牛乳 1L");
  });
});
