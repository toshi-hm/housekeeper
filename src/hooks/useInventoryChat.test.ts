import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import i18n from "@/lib/i18n";

const invokeMock = mock(
  (): Promise<{ data: unknown; error: null }> =>
    Promise.resolve({ data: { reply: "牛乳は2本あります。", items: [] }, error: null }),
);

mock.module("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: invokeMock,
    },
  },
}));

const { askInventoryChat, resolveChatLang, useInventoryChat } =
  await import("@/hooks/useInventoryChat");

// resolveChatLang

describe("resolveChatLang", () => {
  test("ja をそのまま ja として解決する", () => {
    expect(resolveChatLang("ja")).toBe("ja");
  });

  test("en / en-US など en 系はすべて en に解決する", () => {
    expect(resolveChatLang("en")).toBe("en");
    expect(resolveChatLang("en-US")).toBe("en");
  });

  test("未知の言語コードは ja にフォールバックする", () => {
    expect(resolveChatLang("fr")).toBe("ja");
    expect(resolveChatLang("")).toBe("ja");
  });
});

// askInventoryChat

describe("askInventoryChat", () => {
  test("現在の言語を lang として inventory-chat に渡す（#555）", async () => {
    invokeMock.mockClear();
    await askInventoryChat({ message: "牛乳ある？", history: [] }, "en");

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0]?.[0]).toBe("inventory-chat");
    expect(invokeMock.mock.calls[0]?.[1]).toEqual({
      body: { message: "牛乳ある？", history: [], lang: "en" },
    });
  });

  test("ja を渡すと body.lang が ja になる", async () => {
    invokeMock.mockClear();
    await askInventoryChat({ message: "卵ある？", history: [] }, "ja");

    expect(invokeMock.mock.calls[0]?.[1]).toEqual({
      body: { message: "卵ある？", history: [], lang: "ja" },
    });
  });
});

// useInventoryChat

const makeWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(
      I18nextProvider,
      { i18n },
      createElement(QueryClientProvider, { client: queryClient }, children),
    );
};

describe("useInventoryChat", () => {
  test("ask() が現在のi18n言語(ja)をlangとして送信する", async () => {
    invokeMock.mockClear();
    await i18n.changeLanguage("ja");
    const { result } = renderHook(() => useInventoryChat(), { wrapper: makeWrapper() });

    const response = await result.current.ask({ message: "牛乳ある？", history: [] });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(response).toEqual({ reply: "牛乳は2本あります。", items: [] });
    expect(invokeMock.mock.calls[0]?.[1]).toMatchObject({ body: { lang: "ja" } });
  });

  test("ask() がi18n言語をenに切り替えるとlang=enを送信する（#555）", async () => {
    invokeMock.mockClear();
    await i18n.changeLanguage("en");
    const { result } = renderHook(() => useInventoryChat(), { wrapper: makeWrapper() });

    await result.current.ask({ message: "do we have milk?", history: [] });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(invokeMock.mock.calls[0]?.[1]).toMatchObject({ body: { lang: "en" } });

    // Reset for other test files sharing the process-wide i18n instance.
    await i18n.changeLanguage("ja");
  });
});
