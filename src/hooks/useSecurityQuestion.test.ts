import { beforeEach, describe, expect, mock, test } from "bun:test";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

let callLog: Array<{ table: string; method: string; args: unknown[] }> = [];
let upsertResponse: SupabaseResponse = { data: null, error: null };

const makeBuilder = (table: string) => {
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    upsert: (...args: unknown[]) => {
      callLog.push({ table, method: "upsert", args });
      return Promise.resolve(upsertResponse);
    },
  });
  return builder;
};

const fromMock = mock((table: string) => makeBuilder(table));

mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock },
}));

// requireOnline() は navigator.onLine を見るため、テスト環境ではオンライン扱いにしておく
mock.module("@/lib/requireOnline", () => ({
  OfflineError: class OfflineError extends Error {
    readonly isOffline = true;
  },
  requireOnline: () => undefined,
}));

const { upsertSecurityQuestion } = await import("@/hooks/useSecurityQuestion");

beforeEach(() => {
  callLog = [];
  upsertResponse = { data: null, error: null };
  fromMock.mockClear();
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
