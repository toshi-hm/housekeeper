import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

const invokeMock = mock(
  (): Promise<{ data: unknown; error: null }> =>
    Promise.resolve({ data: { reply: "ok", items: [] }, error: null }),
);

mock.module("@/lib/supabase", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

const { toChatLanguage, useInventoryChat } = await import("@/hooks/useInventoryChat");
const { default: i18n } = await import("@/lib/i18n");

describe("toChatLanguage", () => {
  test("normalizes region-tagged English locales to 'en'", () => {
    expect(toChatLanguage("en-US")).toBe("en");
    expect(toChatLanguage("en")).toBe("en");
  });

  test("falls back to 'ja' for anything else", () => {
    expect(toChatLanguage("ja")).toBe("ja");
    expect(toChatLanguage("fr")).toBe("ja");
  });
});

const makeWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(I18nextProvider, { i18n }, children),
    );
};

describe("useInventoryChat", () => {
  test("sends the current i18n language with the chat request", async () => {
    invokeMock.mockClear();
    await i18n.changeLanguage("en");
    const { result } = renderHook(() => useInventoryChat(), { wrapper: makeWrapper() });

    await result.current.ask({ message: "Do I have milk?", history: [] });

    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock.mock.calls[0]?.[1]).toMatchObject({
      body: { message: "Do I have milk?", language: "en" },
    });

    await i18n.changeLanguage("ja");
  });
});
