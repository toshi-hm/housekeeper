import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

const invokeMock = mock(() => Promise.resolve({ data: { reply: "ok", items: [] }, error: null }));

mock.module("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

const { InventoryChatPanel } = await import("./InventoryChatPanel");

const wrapper = ({ children }: { children: ReactNode }) => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(
    QueryClientProvider,
    { client: queryClient },
    createElement(I18nextProvider, { i18n }, children),
  );
};

afterEach(() => {
  cleanup();
  invokeMock.mockClear();
});

describe("InventoryChatPanel", () => {
  test("送信が失敗しても、次の送信で対になっていないuserターンをhistoryに含めない (#554)", async () => {
    const user = userEvent.setup();
    invokeMock
      .mockImplementationOnce(() => Promise.reject(new Error("network error")))
      .mockImplementationOnce(() =>
        Promise.resolve({ data: { reply: "ok", items: [] }, error: null }),
      );

    const { getByLabelText, getByText } = render(<InventoryChatPanel open onClose={() => {}} />, {
      wrapper,
    });

    const input = getByLabelText(i18n.t("chat:inputLabel"));

    await user.type(input, "牛乳ある？");
    await user.click(getByLabelText(i18n.t("chat:send")));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getByText(i18n.t("chat:error"))).toBeTruthy());

    await user.type(input, "パンは？");
    await user.click(getByLabelText(i18n.t("chat:send")));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));

    const secondCallArgs = invokeMock.mock.calls[1]?.[1] as { body: { history: unknown[] } };
    // The first (failed) user turn ("牛乳ある？") must not leak into the
    // second request's history — otherwise Gemini would receive two
    // consecutive `user` turns and reject the request.
    expect(secondCallArgs.body.history).toEqual([]);
  });
});
