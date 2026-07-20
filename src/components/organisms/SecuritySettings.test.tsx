import { fireEvent, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useMfaModule from "@/hooks/useMfa";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

// SecuritySettings renders TotpQrCode during enrollment, which draws onto a
// <canvas> via the "qrcode" package. happy-dom's canvas has no real 2D
// context, so the real implementation throws — mock it out like
// QRCodeDialog.test.tsx does.
mock.module("qrcode", () => ({
  default: { toCanvas: mock(() => Promise.resolve()) },
}));

const { SecuritySettings } = await import("./SecuritySettings");

const toastMock = mock<(message: string, variant?: "success" | "error") => void>(() => {});

const wrapper = ({ children }: { children: ReactNode }) => {
  const stubToast: ToastContextValue = { toasts: [], toast: toastMock, dismiss: () => {} };
  return (
    <I18nextProvider i18n={i18n}>
      <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
    </I18nextProvider>
  );
};

describe("SecuritySettings", () => {
  let factorsSpy: ReturnType<typeof spyOn>;
  let enrollSpy: ReturnType<typeof spyOn>;
  let verifySpy: ReturnType<typeof spyOn>;
  let unenrollSpy: ReturnType<typeof spyOn>;

  const enrollMutateAsync = mock(() =>
    Promise.resolve({
      factorId: "factor-1",
      qrCodeUri: "otpauth://totp/Housekeeper:user@example.com?secret=ABC",
      secret: "ABC",
    }),
  );
  const verifyMutateAsync = mock(() => Promise.resolve());
  const unenrollMutateAsync = mock(() => Promise.resolve());

  beforeEach(() => {
    toastMock.mockClear();
    enrollMutateAsync.mockClear();
    verifyMutateAsync.mockClear();
    unenrollMutateAsync.mockClear();

    factorsSpy = spyOn(useMfaModule, "useMfaFactors").mockReturnValue({
      data: [],
      isLoading: false,
    } as unknown as ReturnType<typeof useMfaModule.useMfaFactors>);

    enrollSpy = spyOn(useMfaModule, "useEnrollTotp").mockReturnValue({
      mutateAsync: enrollMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useMfaModule.useEnrollTotp>);

    verifySpy = spyOn(useMfaModule, "useVerifyTotpEnrollment").mockReturnValue({
      mutateAsync: verifyMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useMfaModule.useVerifyTotpEnrollment>);

    unenrollSpy = spyOn(useMfaModule, "useUnenrollTotp").mockReturnValue({
      mutateAsync: unenrollMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useMfaModule.useUnenrollTotp>);
  });

  afterEach(() => {
    factorsSpy.mockRestore();
    enrollSpy.mockRestore();
    verifySpy.mockRestore();
    unenrollSpy.mockRestore();
  });

  it("shows the enable button when no TOTP factor is enrolled", () => {
    const { getByRole } = render(<SecuritySettings />, { wrapper });

    expect(getByRole("button", { name: /有効化|Enable/i })).not.toBeNull();
  });

  it("shows the disable button when a verified TOTP factor exists", () => {
    factorsSpy.mockReturnValue({
      data: [{ id: "factor-1", factorType: "totp", status: "verified" }],
      isLoading: false,
    } as unknown as ReturnType<typeof useMfaModule.useMfaFactors>);

    const { getByRole } = render(<SecuritySettings />, { wrapper });

    expect(getByRole("button", { name: /無効化|Disable/i })).not.toBeNull();
  });

  it("starts enrollment and shows the QR/secret setup screen", async () => {
    const { getByRole, findByText } = render(<SecuritySettings />, { wrapper });

    fireEvent.click(getByRole("button", { name: /有効化|Enable/i }));

    await waitFor(() => expect(enrollMutateAsync).toHaveBeenCalled());
    expect(await findByText("ABC")).not.toBeNull();
  });

  it("rejects a non-6-digit code without calling verify", async () => {
    const user = userEvent.setup();
    const { getByRole, findByLabelText } = render(<SecuritySettings />, { wrapper });
    fireEvent.click(getByRole("button", { name: /有効化|Enable/i }));
    await waitFor(() => expect(enrollMutateAsync).toHaveBeenCalled());

    const codeInput = await findByLabelText(/認証コード|Verification code/i);
    await user.type(codeInput, "123");
    fireEvent.click(getByRole("button", { name: /確認して有効化|Verify/i }));

    expect(verifyMutateAsync).not.toHaveBeenCalled();
  });

  it("verifies a valid 6-digit code and returns to the idle state", async () => {
    const user = userEvent.setup();
    const { getByRole, findByLabelText } = render(<SecuritySettings />, { wrapper });
    fireEvent.click(getByRole("button", { name: /有効化|Enable/i }));
    await waitFor(() => expect(enrollMutateAsync).toHaveBeenCalled());

    const codeInput = await findByLabelText(/認証コード|Verification code/i);
    await user.type(codeInput, "123456");
    fireEvent.click(getByRole("button", { name: /確認して有効化|Verify/i }));

    await waitFor(() =>
      expect(verifyMutateAsync).toHaveBeenCalledWith({ factorId: "factor-1", code: "123456" }),
    );
    expect(toastMock).toHaveBeenCalledWith(expect.any(String), "success");
  });

  it("cancels enrollment and unenrolls the pending factor", async () => {
    const { getByRole } = render(<SecuritySettings />, { wrapper });
    fireEvent.click(getByRole("button", { name: /有効化|Enable/i }));
    await waitFor(() => expect(enrollMutateAsync).toHaveBeenCalled());

    fireEvent.click(getByRole("button", { name: /キャンセル|Cancel/i }));

    await waitFor(() => expect(unenrollMutateAsync).toHaveBeenCalledWith("factor-1"));
  });

  it("opens a confirm dialog and disables MFA on confirm", async () => {
    factorsSpy.mockReturnValue({
      data: [{ id: "factor-1", factorType: "totp", status: "verified" }],
      isLoading: false,
    } as unknown as ReturnType<typeof useMfaModule.useMfaFactors>);

    const { getByRole, findByRole } = render(<SecuritySettings />, { wrapper });
    fireEvent.click(getByRole("button", { name: /無効化|Disable/i }));

    const dialog = await findByRole("alertdialog");
    const confirmButton = within(dialog).getByRole("button", { name: /無効化|Disable/i });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(unenrollMutateAsync).toHaveBeenCalledWith("factor-1"));
  });
});
