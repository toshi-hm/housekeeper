import { beforeEach, describe, expect, mock, test } from "bun:test";

interface SupabaseResponse {
  data: unknown;
  error: unknown;
}

interface Call {
  method: string;
  args: unknown[];
}

let callLog: Call[] = [];
let response: SupabaseResponse = { data: null, error: null };

const builder: Record<string, unknown> = {};
const chainMethod =
  (method: string) =>
  (...args: unknown[]) => {
    callLog.push({ method, args });
    return builder;
  };

Object.assign(builder, {
  select: chainMethod("select"),
  eq: chainMethod("eq"),
  is: chainMethod("is"),
  not: chainMethod("not"),
  ilike: chainMethod("ilike"),
  order: chainMethod("order"),
  limit: chainMethod("limit"),
  maybeSingle: () => {
    callLog.push({ method: "maybeSingle", args: [] });
    return Promise.resolve(response);
  },
});

const fromMock = mock(() => builder);
const getUserMock = mock(() => Promise.resolve({ data: { user: { id: "user-1" } }, error: null }));

mock.module("@/lib/supabase", () => ({
  supabase: { from: fromMock, auth: { getUser: getUserMock } },
}));

const { fetchSuggestedStorageLocation } = await import("@/hooks/useSuggestedLocation");

beforeEach(() => {
  callLog = [];
  response = { data: null, error: null };
  getUserMock.mockClear();
  fromMock.mockClear();
});

describe("fetchSuggestedStorageLocation (#814)", () => {
  test("barcode/nameのどちらも空なら問い合わせを行わずnullを返す", async () => {
    const result = await fetchSuggestedStorageLocation({});
    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("空白のみのbarcode/nameも未指定として扱う", async () => {
    const result = await fetchSuggestedStorageLocation({ barcode: "  ", name: "  " });
    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  test("barcode一致がある場合、直近のstorage_location_idを返す", async () => {
    response = { data: { storage_location_id: "loc-1" }, error: null };
    const result = await fetchSuggestedStorageLocation({ barcode: "4901234567894" });
    expect(result).toBe("loc-1");

    const eqCall = callLog.find((c) => c.method === "eq" && c.args[0] === "barcode");
    expect(eqCall?.args).toEqual(["barcode", "4901234567894"]);
    const ilikeCall = callLog.find((c) => c.method === "ilike");
    expect(ilikeCall).toBeUndefined();
  });

  test("barcode未指定・name指定時は商品名の完全一致（ilike）で検索する", async () => {
    response = { data: { storage_location_id: "loc-2" }, error: null };
    const result = await fetchSuggestedStorageLocation({ name: "牛乳" });
    expect(result).toBe("loc-2");

    const ilikeCall = callLog.find((c) => c.method === "ilike");
    expect(ilikeCall?.args).toEqual(["name", "牛乳"]);
  });

  test("barcodeとnameの両方が指定された場合はbarcodeを優先する", async () => {
    response = { data: { storage_location_id: "loc-1" }, error: null };
    await fetchSuggestedStorageLocation({ barcode: "123", name: "牛乳" });

    const eqCall = callLog.find((c) => c.method === "eq" && c.args[0] === "barcode");
    expect(eqCall).toBeDefined();
    const ilikeCall = callLog.find((c) => c.method === "ilike");
    expect(ilikeCall).toBeUndefined();
  });

  test("名前中の % や _ はILIKEのワイルドカードとしてではなくリテラルとして扱われる", async () => {
    response = { data: null, error: null };
    await fetchSuggestedStorageLocation({ name: "100%オレンジ_1L" });

    const ilikeCall = callLog.find((c) => c.method === "ilike");
    expect(ilikeCall?.args).toEqual(["name", "100\\%オレンジ\\_1L"]);
  });

  test("マッチが無い場合はnullを返す", async () => {
    response = { data: null, error: null };
    const result = await fetchSuggestedStorageLocation({ barcode: "0000000000000" });
    expect(result).toBeNull();
  });

  test("保管場所が未設定（storage_location_id: null）の行はnullとして扱う", async () => {
    response = { data: { storage_location_id: null }, error: null };
    const result = await fetchSuggestedStorageLocation({ barcode: "123" });
    expect(result).toBeNull();
  });

  test("クエリエラー時はnullを返す（呼び出し側でthrowしない）", async () => {
    response = { data: null, error: { message: "boom" } };
    const result = await fetchSuggestedStorageLocation({ barcode: "123" });
    expect(result).toBeNull();
  });

  test("未認証の場合は問い合わせを行わずnullを返す", async () => {
    getUserMock.mockImplementationOnce(() =>
      Promise.resolve({ data: { user: null }, error: null }),
    );
    const result = await fetchSuggestedStorageLocation({ barcode: "123" });
    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });
});
