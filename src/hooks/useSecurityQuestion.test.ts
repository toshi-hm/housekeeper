import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createElement, type ReactNode } from "react";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

interface AuthUserResponse {
  data: { user: { id: string; email?: string } | null };
  error: unknown;
}

let callLog: Array<{ table: string; method: string; args: unknown[] }> = [];
let upsertResponse: SupabaseResponse = { data: null, error: null };
let selectResponse: SupabaseResponse = { data: null, error: null };
let getUserResponse: AuthUserResponse = {
  data: { user: { id: "user-1", email: "user@example.com" } },
  error: null,
};

const makeBuilder = (table: string) => {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    upsert: (...args: unknown[]) => {
      callLog.push({ table, method: "upsert", args });
      return Promise.resolve(upsertResponse);
    },
    select: (...args: unknown[]) => {
      callLog.push({ table, method: "select", args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      callLog.push({ table, method: "eq", args });
      return builder;
    },
    maybeSingle: () => {
      callLog.push({ table, method: "maybeSingle", args: [] });
      return Promise.resolve(selectResponse);
    },
  });
  return builder;
};

const fromMock = mock((table: string) => makeBuilder(table));
const getUserMock = mock(() => Promise.resolve(getUserResponse));

mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

// requireOnline() は navigator.onLine を見るため、テスト環境ではオンライン扱いにしておく
mock.module("@/lib/requireOnline", () => ({
  OfflineError: class OfflineError extends Error {
    readonly isOffline = true;
  },
  requireOnline: () => undefined,
}));

const { upsertSecurityQuestion, useSecurityQuestionStatus, useUpsertSecurityQuestion } =
  await import("@/hooks/useSecurityQuestion");

const makeWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
};

beforeEach(() => {
  callLog = [];
  upsertResponse = { data: null, error: null };
  selectResponse = { data: null, error: null };
  getUserResponse = { data: { user: { id: "user-1", email: "user@example.com" } }, error: null };
  fromMock.mockClear();
  getUserMock.mockClear();
});

describe("upsertSecurityQuestion (#670)", () => {
  test("user_security_questions へ upsert する", async () => {
    await upsertSecurityQuestion({
      userId: "user-1",
      email: "user@example.com",
      question: "q1",
      answerHash: "hash",
    });

    expect(fromMock).toHaveBeenCalledWith("user_security_questions");
    expect(callLog).toEqual([
      {
        table: "user_security_questions",
        method: "upsert",
        args: [
          {
            user_id: "user-1",
            email: "user@example.com",
            question: "q1",
            answer_hash: "hash",
          },
        ],
      },
    ]);
  });

  test("upsertがエラーを返した場合はthrowする", async () => {
    upsertResponse = { data: null, error: new Error("upsert failed") };

    await expect(
      upsertSecurityQuestion({
        userId: "user-1",
        email: "user@example.com",
        question: "q1",
        answerHash: "hash",
      }),
    ).rejects.toThrow("upsert failed");
  });
});

describe("useSecurityQuestionStatus (#850)", () => {
  test("行が存在すればhasSecurityQuestion: trueとquestionを返す", async () => {
    selectResponse = { data: { question: "初めて飼ったペットの名前は？" }, error: null };

    const { result } = renderHook(() => useSecurityQuestionStatus(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({
      hasSecurityQuestion: true,
      question: "初めて飼ったペットの名前は？",
    });
    expect(fromMock).toHaveBeenCalledWith("user_security_questions");
  });

  test("行が存在しなければhasSecurityQuestion: falseを返す（メール確認必須設定でのサインアップ未完了の状態を再現）", async () => {
    selectResponse = { data: null, error: null };

    const { result } = renderHook(() => useSecurityQuestionStatus(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({ hasSecurityQuestion: false, question: null });
  });

  test("未認証の場合はDBに問い合わせずfalseを返す", async () => {
    getUserResponse = { data: { user: null }, error: null };

    const { result } = renderHook(() => useSecurityQuestionStatus(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data).toEqual({ hasSecurityQuestion: false, question: null });
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("select がエラーを返した場合はthrowする", async () => {
    selectResponse = { data: null, error: new Error("select failed") };

    const { result } = renderHook(() => useSecurityQuestionStatus(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpsertSecurityQuestion (#850)", () => {
  test("現在のセッションのuserId/emailでハッシュ化した答えをupsertする", async () => {
    const { result } = renderHook(() => useUpsertSecurityQuestion(), { wrapper: makeWrapper() });

    await result.current.mutateAsync({ question: "q1", answer: " Tama " });

    const upsertCall = callLog.find((c) => c.method === "upsert");
    expect(upsertCall).toBeDefined();
    const args = upsertCall?.args[0] as Record<string, unknown>;
    expect(args.user_id).toBe("user-1");
    expect(args.email).toBe("user@example.com");
    expect(args.question).toBe("q1");
    expect(typeof args.answer_hash).toBe("string");
    expect(args.answer_hash).not.toBe("");
  });

  test("未認証の場合はthrowしてupsertを呼ばない", async () => {
    getUserResponse = { data: { user: null }, error: null };
    const { result } = renderHook(() => useUpsertSecurityQuestion(), { wrapper: makeWrapper() });

    await expect(result.current.mutateAsync({ question: "q1", answer: "a1" })).rejects.toThrow();
    expect(callLog.some((c) => c.method === "upsert")).toBe(false);
  });
});
