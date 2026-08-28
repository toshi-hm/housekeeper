import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

import { ForgotPasswordPage } from "./forgot-password";

const stubToast: ToastContextValue = { toasts: [], toast: () => {}, dismiss: () => {} };

const wrapper = ({ children }: { children: ReactNode }) => {
  const rootRoute = createRootRoute({ component: () => <>{children}</> });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  return (
    <I18nextProvider i18n={i18n}>
      <ToastContext.Provider value={stubToast}>
        <RouterProvider router={router} />
      </ToastContext.Provider>
    </I18nextProvider>
  );
};

// ForgotPasswordPage は Edge Function（get-security-question /
// verify-security-answer）を直接 fetch() で呼び出す（supabase クライアント経由
// ではない）。#920 で検証したいのはステップ2（答え・新パスワード・パスワード
// 確認）の aria-describedby 配線のみなので、実通信の代わりに固定レスポンスを
// 返すモックに差し替える。
const originalFetch = global.fetch;

beforeEach(() => {
  global.fetch = mock(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ question: "好きな食べ物は？" }),
    } as Response),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

const goToStep2 = async () => {
  // RouterProvider は初回マウント時に非同期でルートマッチングを行うため、
  // render() を act(async () => ...) で包んで解決を待つ（DashboardPage の
  // -_auth.index.test.tsx と同様のパターン）。
  // また happy-dom では type="email"/"password" の <input> に対して
  // fireEvent.change が React の onChange を発火させないため（DOM の value
  // だけが変わり state は更新されない）、実キー入力を模倣する userEvent を使う。
  const user = userEvent.setup();
  let rendered!: ReturnType<typeof render>;
  await act(async () => {
    rendered = render(<ForgotPasswordPage />, { wrapper });
  });
  const { container, getByLabelText } = rendered;
  await user.type(getByLabelText(/メールアドレス|Email/i), "user@example.com");
  await act(async () => {
    fireEvent.submit(container.querySelector("form")!);
  });
  await waitFor(() => expect(container.querySelector("#answer")).not.toBeNull());
  return { container, getByLabelText, user };
};

describe("ForgotPasswordPage / Step2 — aria-describedby / aria-invalid (#920)", () => {
  it("全項目未入力で送信すると、newPasswordがaria-invalid+aria-describedbyで紐付く", async () => {
    const { container } = await goToStep2();
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    const newPasswordInput = container.querySelector("#newPassword") as HTMLInputElement;
    expect(newPasswordInput.getAttribute("aria-invalid")).toBe("true");
    const describedBy = newPasswordInput.getAttribute("aria-describedby");
    expect(describedBy).toBe("newPassword-error");
    expect(container.querySelector(`#${describedBy}`)?.textContent).not.toBe("");
  });

  it("新パスワードは有効だが確認と不一致の場合、confirmPasswordがaria-invalid+aria-describedbyで紐付く", async () => {
    const { container, user } = await goToStep2();
    const newPasswordInput = container.querySelector("#newPassword") as HTMLInputElement;
    const confirmInput = container.querySelector("#confirmPassword") as HTMLInputElement;
    await user.type(newPasswordInput, "Abcd1234!");
    await user.type(confirmInput, "Different1234!");

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(confirmInput.getAttribute("aria-invalid")).toBe("true");
    const describedBy = confirmInput.getAttribute("aria-describedby");
    expect(describedBy).toBe("forgotPasswordConfirm-error");
    expect(container.querySelector(`#${describedBy}`)?.textContent).not.toBe("");
  });

  it("パスワードが一致していても答えが未入力なら、answerがaria-invalid+aria-describedbyで紐付く", async () => {
    const { container, user } = await goToStep2();
    const newPasswordInput = container.querySelector("#newPassword") as HTMLInputElement;
    const confirmInput = container.querySelector("#confirmPassword") as HTMLInputElement;
    await user.type(newPasswordInput, "Abcd1234!");
    await user.type(confirmInput, "Abcd1234!");

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    const answerInput = container.querySelector("#answer") as HTMLInputElement;
    expect(answerInput.getAttribute("aria-invalid")).toBe("true");
    const describedBy = answerInput.getAttribute("aria-describedby");
    expect(describedBy).toBe("answer-error");
    expect(container.querySelector(`#${describedBy}`)?.textContent).not.toBe("");
  });

  it("全項目が有効なら送信後にnewPasswordのaria-invalidがfalseに戻る", async () => {
    const { container, user } = await goToStep2();
    const answerInput = container.querySelector("#answer") as HTMLInputElement;
    const newPasswordInput = container.querySelector("#newPassword") as HTMLInputElement;
    const confirmInput = container.querySelector("#confirmPassword") as HTMLInputElement;

    const form = container.querySelector("form")!;
    fireEvent.submit(form);
    expect(newPasswordInput.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(answerInput, { target: { value: "とんかつ" } });
    await user.type(newPasswordInput, "Abcd1234!");
    await user.type(confirmInput, "Abcd1234!");
    fireEvent.submit(form);

    await waitFor(() => {
      expect(newPasswordInput.getAttribute("aria-invalid")).toBe("false");
    });
    expect(newPasswordInput.getAttribute("aria-describedby")).toBeNull();
  });
});
