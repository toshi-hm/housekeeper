import { beforeEach, describe, expect, mock, test } from "bun:test";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

let callLog: Array<{ table: string; method: string; args: unknown[] }> = [];
const responseQueues: Record<string, SupabaseResponse[]> = {};

const defaultResponse: SupabaseResponse = { data: null, error: null };

// Mirrors the real supabase-js query builder: chain calls (select/eq/insert/
// update/delete) return the same thenable builder, and both `.single()` and
// awaiting the builder directly (e.g. `await .delete().eq(...)`) resolve the
// queued response for that table.
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
    delete: chainMethod("delete"),
    order: chainMethod("order"),
    single: () => {
      callLog.push({ table, method: "single", args: [] });
      return Promise.resolve(response);
    },
    then: (resolve: (value: SupabaseResponse) => unknown) => resolve(response),
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

const { createCustomUnit, deleteCustomUnit, DuplicateNameError, InvalidNameLengthError } =
  await import("@/hooks/useCustomUnits");

beforeEach(() => {
  callLog = [];
  for (const key of Object.keys(responseQueues)) delete responseQueues[key];
  getUserMock.mockClear();
});

describe("createCustomUnit", () => {
  test("41文字以上の名前はInvalidNameLengthErrorをthrowする", async () => {
    await expect(createCustomUnit("a".repeat(41))).rejects.toBeInstanceOf(InvalidNameLengthError);
  });

  test("空文字はInvalidNameLengthErrorをthrowする", async () => {
    await expect(createCustomUnit("")).rejects.toBeInstanceOf(InvalidNameLengthError);
  });

  test("一意制約違反(23505)の場合、既存行を返さずDuplicateNameErrorをthrowする", async () => {
    responseQueues.custom_units = [{ data: null, error: { code: "23505" } }];
    await expect(createCustomUnit("缶")).rejects.toBeInstanceOf(DuplicateNameError);

    const findCall = callLog.find((c) => c.table === "custom_units" && c.method === "eq");
    expect(findCall).toBeUndefined();
  });

  test("成功時は作成したカスタム単位を返す", async () => {
    responseQueues.custom_units = [{ data: { id: "unit-1", name: "缶" }, error: null }];
    const result = await createCustomUnit("缶");
    expect(result).toEqual({ id: "unit-1", name: "缶" });

    const insertCall = callLog.find((c) => c.table === "custom_units" && c.method === "insert");
    expect(insertCall?.args).toEqual([{ name: "缶", user_id: "user-1" }]);
  });

  test("他のエラーはそのままthrowする", async () => {
    responseQueues.custom_units = [{ data: null, error: { code: "23503", message: "fk" } }];
    await expect(createCustomUnit("缶")).rejects.toMatchObject({ code: "23503" });
  });
});

describe("deleteCustomUnit", () => {
  test("使用中チェックなしでdeleteを呼び出す（content_unitはFKではないため）", async () => {
    await deleteCustomUnit("unit-1");

    const deleteCall = callLog.find((c) => c.table === "custom_units" && c.method === "delete");
    expect(deleteCall).toBeDefined();
    const eqCall = callLog.find((c) => c.table === "custom_units" && c.method === "eq");
    expect(eqCall?.args).toEqual(["id", "unit-1"]);
  });

  test("DBエラーはそのままthrowする", async () => {
    responseQueues.custom_units = [{ data: null, error: { code: "500", message: "boom" } }];
    await expect(deleteCustomUnit("unit-1")).rejects.toMatchObject({ code: "500" });
  });
});
