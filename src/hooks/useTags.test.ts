import { beforeEach, describe, expect, mock, test } from "bun:test";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

let callLog: Array<{ table: string; method: string; args: unknown[] }> = [];
const responseQueues: Record<string, SupabaseResponse[]> = {};

const defaultResponse: SupabaseResponse = { data: null, error: null };

const makeBuilder = (table: string, response: SupabaseResponse) => {
  const builder: Record<string, unknown> = {};
  const chainMethod =
    (method: string) =>
    (...args: unknown[]) => {
      callLog.push({ table, method, args });
      return builder;
    };

  Object.assign(builder, {
    select: chainMethod("select"),
    eq: chainMethod("eq"),
    insert: chainMethod("insert"),
    update: chainMethod("update"),
    single: () => {
      callLog.push({ table, method: "single", args: [] });
      return Promise.resolve(response);
    },
  });
  return builder;
};

const fromMock = mock((table: string) => {
  const queue = responseQueues[table];
  const response = queue && queue.length > 0 ? queue.shift()! : defaultResponse;
  return makeBuilder(table, response);
});

const getUserMock = mock(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }));

mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

const { createTag, updateTag, DuplicateNameError, InvalidNameLengthError } =
  await import("@/hooks/useTags");

beforeEach(() => {
  callLog = [];
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
  getUserMock.mockClear();
});

describe("createTag", () => {
  test("41文字以上の名前はInvalidNameLengthErrorをthrowする (#917)", async () => {
    await expect(createTag("a".repeat(41))).rejects.toBeInstanceOf(InvalidNameLengthError);
  });

  test("空文字はInvalidNameLengthErrorをthrowする (#917)", async () => {
    await expect(createTag("")).rejects.toBeInstanceOf(InvalidNameLengthError);
  });

  test("一意制約違反(23505)の場合、DuplicateNameErrorをthrowする (#917)", async () => {
    responseQueues.item_tags = [{ data: null, error: { code: "23505" } }];
    await expect(createTag("食品")).rejects.toBeInstanceOf(DuplicateNameError);
  });

  test("成功時は作成したタグを返す", async () => {
    responseQueues.item_tags = [{ data: { id: "tag-1", name: "食品", color: null }, error: null }];
    const result = await createTag("食品");
    expect(result).toEqual({ id: "tag-1", name: "食品", color: null });
  });
});

describe("updateTag", () => {
  test("41文字以上の名前はInvalidNameLengthErrorをthrowする (#917)", async () => {
    await expect(updateTag("tag-1", "a".repeat(41))).rejects.toBeInstanceOf(InvalidNameLengthError);
  });

  test("一意制約違反(23505)の場合、DuplicateNameErrorをthrowする (#917)", async () => {
    responseQueues.item_tags = [{ data: null, error: { code: "23505" } }];
    await expect(updateTag("tag-1", "食品")).rejects.toBeInstanceOf(DuplicateNameError);
  });

  test("成功時は更新したタグを返す", async () => {
    responseQueues.item_tags = [
      { data: { id: "tag-1", name: "日用品", color: null }, error: null },
    ];
    const result = await updateTag("tag-1", "日用品");
    expect(result).toEqual({ id: "tag-1", name: "日用品", color: null });
  });
});
