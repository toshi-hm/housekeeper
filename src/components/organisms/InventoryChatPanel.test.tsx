import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

const invokeMock = mock<(...args: unknown[]) => Promise<{ data: unknown; error: null }>>(() =>
  Promise.resolve({ data: { reply: "ok", items: [] }, error: null }),
);

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

  test("エラー応答の再試行ボタンをクリックすると同じ質問を打ち直さず再送信する (#748)", async () => {
    const user = userEvent.setup();
    invokeMock
      .mockImplementationOnce(() => Promise.reject(new Error("network error")))
      .mockImplementationOnce(() =>
        Promise.resolve({ data: { reply: "牛乳は2本あります", items: [] }, error: null }),
      );

    const { getByLabelText, getByText, getByRole } = render(
      <InventoryChatPanel open onClose={() => {}} />,
      { wrapper },
    );

    const input = getByLabelText(i18n.t("chat:inputLabel"));
    await user.type(input, "牛乳ある？");
    await user.click(getByLabelText(i18n.t("chat:send")));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getByText(i18n.t("chat:error"))).toBeTruthy());

    await user.click(getByRole("button", { name: i18n.t("chat:retry") }));

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    const retryCallArgs = invokeMock.mock.calls[1]?.[1] as { body: { message: string } };
    expect(retryCallArgs.body.message).toBe("牛乳ある？");
    await waitFor(() => expect(getByText("牛乳は2本あります")).toBeTruthy());
  });
  test("献立タブでは meal-plan-chat を呼び、会話は在庫タブと分離される", async () => {
    const user = userEvent.setup();
    invokeMock
      .mockImplementationOnce(() =>
        Promise.resolve({ data: { reply: "牛乳は2本あります", items: [] }, error: null }),
      )
      .mockImplementationOnce(() =>
        Promise.resolve({ data: { reply: "肉じゃがはどう？", items: [] }, error: null }),
      );

    const { getByLabelText, getByText, getByRole, queryByText } = render(
      <InventoryChatPanel open onClose={() => {}} />,
      { wrapper },
    );

    await user.type(getByLabelText(i18n.t("chat:inputLabel")), "牛乳ある？");
    await user.click(getByLabelText(i18n.t("chat:send")));
    await waitFor(() => expect(getByText("牛乳は2本あります")).toBeTruthy());
    expect(invokeMock.mock.calls[0]?.[0]).toBe("inventory-chat");

    await user.click(getByRole("button", { name: i18n.t("chat:agentMeal") }));
    // 在庫タブの会話は引き継がれず、献立タブ固有の案内が出る
    expect(queryByText("牛乳は2本あります")).toBeNull();
    expect(getByText(i18n.t("chat:mealEmptyHint"))).toBeTruthy();

    await user.type(getByLabelText(i18n.t("chat:inputLabel")), "今日の晩ごはんは？");
    await user.click(getByLabelText(i18n.t("chat:send")));
    await waitFor(() => expect(getByText("肉じゃがはどう？")).toBeTruthy());
    expect(invokeMock.mock.calls[1]?.[0]).toBe("meal-plan-chat");
    // 在庫タブの履歴は献立リクエストに混ざらない
    const mealCallArgs = invokeMock.mock.calls[1]?.[1] as { body: { history: unknown[] } };
    expect(mealCallArgs.body.history).toEqual([]);

    // 在庫タブへ戻ると元の会話が残っている
    await user.click(getByRole("button", { name: i18n.t("chat:agentInventory") }));
    expect(getByText("牛乳は2本あります")).toBeTruthy();
  });
});
