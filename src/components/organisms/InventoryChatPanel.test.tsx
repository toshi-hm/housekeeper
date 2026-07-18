import { cleanup, render, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

const askMock = mock(() => Promise.reject(new Error("network error")));

mock.module("@/hooks/useInventoryChat", () => ({
  useInventoryChat: () => ({ ask: askMock, isLoading: false }),
}));

const { InventoryChatPanel } = await import("./InventoryChatPanel");

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(I18nextProvider, { i18n }, children);

afterEach(() => {
  cleanup();
  askMock.mockClear();
});

describe("InventoryChatPanel", () => {
  test("送信失敗後の次回送信では、対になっていないuser履歴を送らない (#554)", async () => {
    const user = userEvent.setup();
    const { getByLabelText, getByText } = render(<InventoryChatPanel open onClose={() => {}} />, {
      wrapper,
    });

    const input = getByLabelText(i18n.t("chat:inputLabel"));
    const sendButton = getByLabelText(i18n.t("chat:send"));

    // 1回目の送信は失敗する
    await user.type(input, "牛乳ある？");
    await user.click(sendButton);
    await waitFor(() => expect(askMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getByText(i18n.t("chat:error"))).toBeTruthy());

    // 2回目の送信時に渡される history に、失敗した1回目のuserターンが含まれないこと
    await user.type(input, "卵は？");
    await user.click(sendButton);
    await waitFor(() => expect(askMock).toHaveBeenCalledTimes(2));

    const secondCallArgs = askMock.mock.calls[1]?.[0] as { history: unknown[] } | undefined;
    expect(secondCallArgs?.history).toEqual([]);
  });
});
