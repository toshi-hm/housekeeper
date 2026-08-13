import { describe, expect, test } from "bun:test";

import { OfflineError } from "@/lib/requireOnline";
import { isSchemaMismatchError } from "@/lib/supabaseErrors";

/** PostgREST が返すエラーオブジェクトの最小形。 */
const postgrestError = (code: string, message: string) => ({
  code,
  message,
  details: null,
  hint: null,
});

describe("isSchemaMismatchError", () => {
  test("送信した列がスキーマキャッシュに無い場合 (PGRST204) を検出する", () => {
    // 本番DBに 20260801000001_add_expiry_type_to_items.sql が未適用のまま
    // アイテムを保存したときに実際に返るエラー。
    const error = postgrestError(
      "PGRST204",
      "Could not find the 'expiry_type' column of 'items' in the schema cache",
    );
    expect(isSchemaMismatchError(error)).toBe(true);
  });

  test("RPC がスキーマキャッシュに無い場合 (PGRST202) を検出する", () => {
    const error = postgrestError(
      "PGRST202",
      "Could not find the function public.import_items_batch",
    );
    expect(isSchemaMismatchError(error)).toBe(true);
  });

  test("Postgres の undefined_column / undefined_table / undefined_function を検出する", () => {
    expect(
      isSchemaMismatchError(postgrestError("42703", 'column "store_name" does not exist')),
    ).toBe(true);
    expect(
      isSchemaMismatchError(postgrestError("42P01", 'relation "meal_plans" does not exist')),
    ).toBe(true);
    expect(
      isSchemaMismatchError(
        postgrestError("42883", "function public.bulk_consume_items does not exist"),
      ),
    ).toBe(true);
  });

  test("RLS 違反などスキーマずれ以外のDBエラーは false", () => {
    expect(
      isSchemaMismatchError(
        postgrestError("42501", 'new row violates row-level security policy for table "items"'),
      ),
    ).toBe(false);
    expect(isSchemaMismatchError(postgrestError("23505", "duplicate key value"))).toBe(false);
  });

  test("code を持たないエラーは false", () => {
    expect(isSchemaMismatchError(new Error("boom"))).toBe(false);
    expect(isSchemaMismatchError(new OfflineError())).toBe(false);
    expect(isSchemaMismatchError(null)).toBe(false);
    expect(isSchemaMismatchError(undefined)).toBe(false);
    expect(isSchemaMismatchError("PGRST204")).toBe(false);
  });

  test("code が文字列でない場合は false", () => {
    expect(isSchemaMismatchError({ code: 42703 })).toBe(false);
  });
});
