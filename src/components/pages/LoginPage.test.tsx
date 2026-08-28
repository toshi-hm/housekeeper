import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, mock } from "bun:test";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";
import { ToastContext, type ToastContextValue } from "@/lib/toast-context";

// LoginPage は isAvailableRegisterNewUser（現在 false 固定）で新規登録導線の
// 表示可否を切り替える。サインアップ専用フィールド（confirmPassword /
// securityQuestion / securityAnswer）の aria-describedby 配線を検証するには
// サインアップモードへ遷移できる必要があるため true に差し替える。
// この定数は LoginPage.tsx からしか import されていないため（#920 実装時点で
// 確認済み）、mock.module() のプロセス全体への漏出リスクは無い。
mock.module("@/config/auth", () => ({ isAvailableRegisterNewUser: true }));

// LoginPage はマウント時に必ず supabase.auth.mfa.getAuthenticatorAssuranceLevel()
// を呼ぶ（#366 の保留中MFAチェック）。@/lib/supabase の実クライアントは実通信を
// 行うため、他のテストファイル（ItemImage.test.tsx / InventoryChatPanel.test.tsx
// など）と同様に @/lib/supabase をモックする。aal2 昇格不要（currentLevel ===
// nextLevel）を返すことで、対象外のログイン/サインアップフォーム側のテストが
// 意図せずMFAモードへ遷移しないようにする。
mock.module("@/lib/supabase", () => ({
  supabase: {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: () =>
          Promise.resolve({ data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null }),
        listFactors: () => Promise.resolve({ data: { totp: [] }, error: null }),
      },
    },
  },
}));

const { LoginPage } = await import("./LoginPage");

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

// RouterProvider は初回マウント時に非同期でルートマッチングを行うため、
// render() を act(async () => ...) で包んで解決を待つ（DashboardPage の
// -_auth.index.test.tsx と同様のパターン）。
const renderPage = async () => {
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(<LoginPage />, { wrapper });
  });
  return result;
};

describe("LoginPage — aria-describedby / aria-invalid (#920)", () => {
  it("ログインモードで未入力のまま送信するとemail/passwordがaria-invalid+aria-describedbyで紐付く", async () => {
    const { container } = await renderPage();
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    const emailInput = container.querySelector("#email") as HTMLInputElement;
    expect(emailInput.getAttribute("aria-invalid")).toBe("true");
    const emailDescribedBy = emailInput.getAttribute("aria-describedby");
    expect(emailDescribedBy).toBe("email-error");
    expect(container.querySelector(`#${emailDescribedBy}`)?.textContent).not.toBe("");

    const passwordInput = container.querySelector("#password") as HTMLInputElement;
    expect(passwordInput.getAttribute("aria-invalid")).toBe("true");
    const passwordDescribedBy = passwordInput.getAttribute("aria-describedby");
    expect(passwordDescribedBy).toBe("password-error");
    expect(container.querySelector(`#${passwordDescribedBy}`)?.textContent).not.toBe("");
  });

  it("emailのみ有効な値に修正して再送信すると、emailのエラーだけ解消されpasswordのエラーは残る", async () => {
    // handleLogin は loginSchema の検証を通るとsupabaseへ実通信するため、ここでは
    // password を空のままにして通信が発生しない（=検証で必ず弾かれる）状態を保つ。
    // なお happy-dom では type="email"/"password" の <input> に対して
    // fireEvent.change が React の onChange を発火させないため（DOM の value
    // だけが変わり state は更新されない）、実キー入力を模倣する userEvent を使う。
    const user = userEvent.setup();
    const { container } = await renderPage();
    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    const emailInput = container.querySelector("#email") as HTMLInputElement;
    const passwordInput = container.querySelector("#password") as HTMLInputElement;
    expect(emailInput.getAttribute("aria-invalid")).toBe("true");
    expect(passwordInput.getAttribute("aria-invalid")).toBe("true");

    await user.type(emailInput, "user@example.com");
    fireEvent.submit(form);

    expect(emailInput.getAttribute("aria-invalid")).toBe("false");
    expect(emailInput.getAttribute("aria-describedby")).toBeNull();
    expect(passwordInput.getAttribute("aria-invalid")).toBe("true");
    expect(passwordInput.getAttribute("aria-describedby")).toBe("password-error");
  });

  it("サインアップモードでパスワード確認が不一致のままフォームを送信するとconfirmPasswordがaria-invalid+aria-describedbyで紐付く", async () => {
    const user = userEvent.setup();
    const { container, getByText } = await renderPage();
    fireEvent.click(getByText(/Sign up|アカウントをお持ちでない/i));

    const passwordInput = container.querySelector("#password") as HTMLInputElement;
    const confirmInput = container.querySelector("#confirmPassword") as HTMLInputElement;
    await user.type(passwordInput, "Abcd1234!");
    await user.type(confirmInput, "Different1234!");

    expect(confirmInput.getAttribute("aria-invalid")).toBe("true");
    const describedBy = confirmInput.getAttribute("aria-describedby");
    expect(describedBy).toBe("confirmPassword-error");
    expect(container.querySelector(`#${describedBy}`)?.textContent).not.toBe("");
  });

  it("サインアップモードで秘密の質問未選択のまま送信するとsecurityQuestionがaria-invalid+aria-describedbyで紐付く", async () => {
    const { container, getByText } = await renderPage();
    fireEvent.click(getByText(/Sign up|アカウントをお持ちでない/i));

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    const questionSelect = container.querySelector("#securityQuestion") as HTMLSelectElement;
    expect(questionSelect.getAttribute("aria-invalid")).toBe("true");
    const describedBy = questionSelect.getAttribute("aria-describedby");
    expect(describedBy).toBe("securityQuestion-error");
    expect(container.querySelector(`#${describedBy}`)?.textContent).not.toBe("");
  });

  it("サインアップモードで秘密の答えは常にヒントを参照し、エラー時はエラーidも追加でaria-describedbyに含まれる", async () => {
    const { container, getByText } = await renderPage();
    fireEvent.click(getByText(/Sign up|アカウントをお持ちでない/i));

    const answerInput = container.querySelector("#securityAnswer") as HTMLInputElement;
    expect(answerInput.getAttribute("aria-describedby")).toBe("securityAnswer-hint");
    expect(answerInput.getAttribute("aria-invalid")).toBe("false");

    const form = container.querySelector("form")!;
    fireEvent.submit(form);

    expect(answerInput.getAttribute("aria-invalid")).toBe("true");
    const describedBy = answerInput.getAttribute("aria-describedby")!;
    expect(describedBy).toBe("securityAnswer-hint securityAnswer-error");
    for (const id of describedBy.split(" ")) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
  });
});
