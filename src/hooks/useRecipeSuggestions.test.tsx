import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

interface InvokeResult {
  data: unknown;
  error: unknown;
}

let invokeResult: InvokeResult = { data: { recipes: [] }, error: null };
const invokeMock = mock(() => Promise.resolve(invokeResult));

mock.module("@/lib/supabase", () => ({
  supabase: { functions: { invoke: invokeMock } },
}));

const { useRecipeSuggestions } = await import("@/hooks/useRecipeSuggestions");

const makeWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

beforeEach(() => {
  invokeResult = { data: { recipes: [] }, error: null };
  invokeMock.mockClear();
});

describe("useRecipeSuggestions", () => {
  test("食材名が空のときは Edge Function を呼ばない", () => {
    const { result } = renderHook(() => useRecipeSuggestions([]), { wrapper: makeWrapper() });

    expect(result.current.fetchStatus).toBe("idle");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  test("重複を除去してソートした食材名で recipe-suggest を呼ぶ", async () => {
    const recipe = { id: "1", title: "親子丼", url: "https://example.com/1", imageUrl: null };
    invokeResult = { data: { recipes: [recipe] }, error: null };

    const { result } = renderHook(() => useRecipeSuggestions(["卵", "鶏肉", "卵"]), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([recipe]);
    expect(invokeMock).toHaveBeenCalledTimes(1);
    const [name, options] = invokeMock.mock.calls[0] as unknown as [
      string,
      { body: { itemNames: string[] } },
    ];
    expect(name).toBe("recipe-suggest");
    expect(options.body.itemNames).toEqual([...new Set(["卵", "鶏肉"])].sort());
  });

  test("Edge Function がエラーを返したら空配列へ縮退する", async () => {
    invokeResult = { data: null, error: new Error("boom") };

    const { result } = renderHook(() => useRecipeSuggestions(["卵"]), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  test("API キー未設定（reason 付きの空リスト）は空配列になる", async () => {
    invokeResult = { data: { recipes: [], reason: "missing_api_key" }, error: null };

    const { result } = renderHook(() => useRecipeSuggestions(["卵"]), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  test("data が null でも空配列を返す", async () => {
    invokeResult = { data: null, error: null };

    const { result } = renderHook(() => useRecipeSuggestions(["卵"]), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});
