import { fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import * as useSecurityQuestionModule from "@/hooks/useSecurityQuestion";
import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

const { SecurityQuestionSettings } = await import("./SecurityQuestionSettings");

const toastMock = mock<(message: string, variant?: "success" | "error") => void>(() => {});

const wrapper = ({ children }: { children: ReactNode }) => {
  const stubToast: ToastContextValue = { toasts: [], toast: toastMock, dismiss: () => {} };
  return (
    <I18nextProvider i18n={i18n}>
      <ToastContext.Provider value={stubToast}>{children}</ToastContext.Provider>
    </I18nextProvider>
  );
};

describe("SecurityQuestionSettings (#850)", () => {
  let statusSpy: ReturnType<typeof spyOn>;
  let upsertSpy: ReturnType<typeof spyOn>;

  const upsertMutateAsync = mock(() => Promise.resolve());

  beforeEach(() => {
    toastMock.mockClear();
    upsertMutateAsync.mockClear();

    statusSpy = spyOn(useSecurityQuestionModule, "useSecurityQuestionStatus").mockReturnValue({
      data: { hasSecurityQuestion: false, question: null },
      isLoading: false,
    } as unknown as ReturnType<typeof useSecurityQuestionModule.useSecurityQuestionStatus>);

    upsertSpy = spyOn(useSecurityQuestionModule, "useUpsertSecurityQuestion").mockReturnValue({
      mutateAsync: upsertMutateAsync,
      isPending: false,
    } as unknown as ReturnType<typeof useSecurityQuestionModule.useUpsertSecurityQuestion>);
  });

  afterEach(() => {
    statusSpy.mockRestore();
    upsertSpy.mockRestore();
  });

  it("shows 'not set' and a set-up button when no security question is registered", () => {
    const { getByRole, getByText } = render(<SecurityQuestionSettings />, { wrapper });

    expect(getByText(/未設定です|Not set/i)).not.toBeNull();
    expect(getByRole("button", { name: /設定する|Set up/i })).not.toBeNull();
  });

  it("shows the current question and an update button when already registered", () => {
    statusSpy.mockReturnValue({
      data: { hasSecurityQuestion: true, question: "初めて飼ったペットの名前は？" },
      isLoading: false,
    } as unknown as ReturnType<typeof useSecurityQuestionModule.useSecurityQuestionStatus>);

    const { getByRole, getByText } = render(<SecurityQuestionSettings />, { wrapper });

    expect(getByText("初めて飼ったペットの名前は？")).not.toBeNull();
    expect(getByRole("button", { name: /変更する|Change/i })).not.toBeNull();
  });

  it("shows an error message and retry button when the status query fails, instead of silently showing 'not set'", () => {
    const refetchMock = mock(() => Promise.resolve());
    statusSpy.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: refetchMock,
    } as unknown as ReturnType<typeof useSecurityQuestionModule.useSecurityQuestionStatus>);

    const { getByRole, queryByText } = render(<SecurityQuestionSettings />, { wrapper });

    expect(queryByText(/未設定です|Not set/i)).toBeNull();
    fireEvent.click(getByRole("button", { name: /再試行|Retry/i }));
    expect(refetchMock).toHaveBeenCalled();
  });

  it("rejects saving without selecting a question or entering an answer", async () => {
    const { getByRole, findByText } = render(<SecurityQuestionSettings />, { wrapper });

    fireEvent.click(getByRole("button", { name: /設定する|Set up/i }));
    fireEvent.click(getByRole("button", { name: /保存|Save/i }));

    expect(
      await findByText(/秘密の質問を選択してください|Please select a security question/i),
    ).not.toBeNull();
    expect(upsertMutateAsync).not.toHaveBeenCalled();
  });

  it("saves a selected question and typed answer", async () => {
    const user = userEvent.setup();
    const { getByRole, findByLabelText, getByLabelText } = render(<SecurityQuestionSettings />, {
      wrapper,
    });

    fireEvent.click(getByRole("button", { name: /設定する|Set up/i }));

    const petQuestionLabel = i18n.t("auth:securityQuestionOptions.pet");
    const questionSelect = await findByLabelText(/秘密の質問|Security Question/i);
    await user.selectOptions(questionSelect, petQuestionLabel);
    await user.type(getByLabelText(/秘密の質問の答え|Security Answer/i), "Tama");
    fireEvent.click(getByRole("button", { name: /保存|Save/i }));

    await waitFor(() =>
      expect(upsertMutateAsync).toHaveBeenCalledWith({
        question: petQuestionLabel,
        answer: "Tama",
      }),
    );
    expect(toastMock).toHaveBeenCalledWith(expect.any(String), "success");
  });

  it("shows an error toast when saving fails", async () => {
    upsertMutateAsync.mockImplementationOnce(() => Promise.reject(new Error("save failed")));
    const user = userEvent.setup();
    const { getByRole, findByLabelText, getByLabelText } = render(<SecurityQuestionSettings />, {
      wrapper,
    });

    fireEvent.click(getByRole("button", { name: /設定する|Set up/i }));
    const questionSelect = await findByLabelText(/秘密の質問|Security Question/i);
    await user.selectOptions(questionSelect, i18n.t("auth:securityQuestionOptions.pet"));
    await user.type(getByLabelText(/秘密の質問の答え|Security Answer/i), "Tama");
    fireEvent.click(getByRole("button", { name: /保存|Save/i }));

    await waitFor(() => expect(toastMock).toHaveBeenCalledWith(expect.any(String), "error"));
  });

  it("cancels editing without saving", async () => {
    const { getByRole } = render(<SecurityQuestionSettings />, { wrapper });

    fireEvent.click(getByRole("button", { name: /設定する|Set up/i }));
    fireEvent.click(getByRole("button", { name: /キャンセル|Cancel/i }));

    expect(getByRole("button", { name: /設定する|Set up/i })).not.toBeNull();
    expect(upsertMutateAsync).not.toHaveBeenCalled();
  });
});
