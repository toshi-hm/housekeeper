import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it, spyOn } from "bun:test";
import { I18nextProvider } from "react-i18next";

import * as useSecurityQuestionModule from "@/hooks/useSecurityQuestion";
import i18n from "@/lib/i18n";

import { SecurityQuestionReminderBanner } from "./SecurityQuestionReminderBanner";

const renderBanner = async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({
    component: () => <SecurityQuestionReminderBanner />,
  });
  const router = createRouter({ routeTree: rootRoute, history: createMemoryHistory() });
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <RouterProvider router={router} />
        </I18nextProvider>
      </QueryClientProvider>,
    );
  });
  return result;
};

describe("SecurityQuestionReminderBanner (#850)", () => {
  it("shows nothing while the status query is loading, to avoid a false-positive flash", async () => {
    const spy = spyOn(useSecurityQuestionModule, "useSecurityQuestionStatus").mockReturnValue({
      data: undefined,
      isLoading: true,
    } as unknown as ReturnType<typeof useSecurityQuestionModule.useSecurityQuestionStatus>);

    const { queryByRole } = await renderBanner();
    expect(queryByRole("status")).toBeNull();

    spy.mockRestore();
  });

  it("shows nothing when a security question is already registered", async () => {
    const spy = spyOn(useSecurityQuestionModule, "useSecurityQuestionStatus").mockReturnValue({
      data: { hasSecurityQuestion: true, question: "初めて飼ったペットの名前は？" },
      isLoading: false,
    } as unknown as ReturnType<typeof useSecurityQuestionModule.useSecurityQuestionStatus>);

    const { queryByRole } = await renderBanner();
    expect(queryByRole("status")).toBeNull();

    spy.mockRestore();
  });

  it("shows a reminder with a link to Settings when no security question is registered", async () => {
    const spy = spyOn(useSecurityQuestionModule, "useSecurityQuestionStatus").mockReturnValue({
      data: { hasSecurityQuestion: false, question: null },
      isLoading: false,
    } as unknown as ReturnType<typeof useSecurityQuestionModule.useSecurityQuestionStatus>);

    const { getByRole } = await renderBanner();
    expect(getByRole("status")).not.toBeNull();
    expect(getByRole("link", { name: /設定画面を開く|Open Settings/i })).not.toBeNull();

    spy.mockRestore();
  });

  it("dismisses the banner for the rest of the session when the close button is clicked", async () => {
    const spy = spyOn(useSecurityQuestionModule, "useSecurityQuestionStatus").mockReturnValue({
      data: { hasSecurityQuestion: false, question: null },
      isLoading: false,
    } as unknown as ReturnType<typeof useSecurityQuestionModule.useSecurityQuestionStatus>);

    const { getByRole, queryByRole } = await renderBanner();
    fireEvent.click(getByRole("button", { name: /閉じる|Close/i }));
    expect(queryByRole("status")).toBeNull();

    spy.mockRestore();
  });
});
