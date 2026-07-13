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

const {
  createCategory,
  updateCategory,
  createStorageLocation,
  updateStorageLocation,
  DuplicateNameError,
  InvalidNameLengthError,
} = await import("@/hooks/useMasterData");

beforeEach(() => {
  callLog = [];
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
  getUserMock.mockClear();
});

describe("createCategory", () => {
  test("41文字以上の名前はInvalidNameLengthErrorをthrowする (#470)", async () => {
    await expect(createCategory("a".repeat(41))).rejects.toBeInstanceOf(InvalidNameLengthError);
  });

  test("空文字はInvalidNameLengthErrorをthrowする (#470)", async () => {
    await expect(createCategory("")).rejects.toBeInstanceOf(InvalidNameLengthError);
  });

  test("一意制約違反(23505)の場合、既存行を返さずDuplicateNameErrorをthrowする (#502)", async () => {
    responseQueues.categories = [{ data: null, error: { code: "23505" } }];
    await expect(createCategory("冷蔵庫")).rejects.toBeInstanceOf(DuplicateNameError);

    const findCall = callLog.find((c) => c.table === "categories" && c.method === "eq");
    expect(findCall).toBeUndefined();
  });

  test("成功時は作成したカテゴリを返す", async () => {
    responseQueues.categories = [
      { data: { id: "cat-1", name: "冷蔵庫", color: null }, error: null },
    ];
    const result = await createCategory("冷蔵庫");
    expect(result).toEqual({ id: "cat-1", name: "冷蔵庫", color: null });
  });
});

describe("updateCategory", () => {
  test("一意制約違反(23505)の場合、DuplicateNameErrorをthrowする (#502)", async () => {
    responseQueues.categories = [{ data: null, error: { code: "23505" } }];
    await expect(updateCategory("cat-1", "冷蔵庫")).rejects.toBeInstanceOf(DuplicateNameError);
  });

  test("41文字以上の名前はInvalidNameLengthErrorをthrowする (#470)", async () => {
    await expect(updateCategory("cat-1", "a".repeat(41))).rejects.toBeInstanceOf(
      InvalidNameLengthError,
    );
  });
});

describe("createStorageLocation", () => {
  test("一意制約違反(23505)の場合、既存行を返さずDuplicateNameErrorをthrowする (#502)", async () => {
    responseQueues.storage_locations = [{ data: null, error: { code: "23505" } }];
    await expect(createStorageLocation("キッチン")).rejects.toBeInstanceOf(DuplicateNameError);

    const findCall = callLog.find((c) => c.table === "storage_locations" && c.method === "eq");
    expect(findCall).toBeUndefined();
  });

  test("41文字以上の名前はInvalidNameLengthErrorをthrowする (#470)", async () => {
    await expect(createStorageLocation("a".repeat(41))).rejects.toBeInstanceOf(
      InvalidNameLengthError,
    );
  });
});

describe("updateStorageLocation", () => {
  test("一意制約違反(23505)の場合、DuplicateNameErrorをthrowする (#502)", async () => {
    responseQueues.storage_locations = [{ data: null, error: { code: "23505" } }];
    await expect(updateStorageLocation("loc-1", "キッチン")).rejects.toBeInstanceOf(
      DuplicateNameError,
    );
  });

  test("41文字以上の名前はInvalidNameLengthErrorをthrowする (#470)", async () => {
    await expect(updateStorageLocation("loc-1", "a".repeat(41))).rejects.toBeInstanceOf(
      InvalidNameLengthError,
    );
  });
});
