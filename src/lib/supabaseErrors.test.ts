import { describe, expect, test } from "bun:test";

import { OfflineError } from "@/lib/requireOnline";
import {
  isNetworkFetchError,
  isPermanentReplayError,
  isSchemaMismatchError,
} from "@/lib/supabaseErrors";

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

describe("isNetworkFetchError", () => {
  test("Chrome/Edgeのfetch失敗メッセージ(Failed to fetch)を検出する", () => {
    expect(isNetworkFetchError(new TypeError("Failed to fetch"))).toBe(true);
  });

  test("Firefoxのfetch失敗メッセージ(NetworkError)を検出する", () => {
    expect(
      isNetworkFetchError(new TypeError("NetworkError when attempting to fetch resource.")),
    ).toBe(true);
  });

  test("大文字小文字を区別しない", () => {
    expect(isNetworkFetchError(new TypeError("FAILED TO FETCH"))).toBe(true);
  });

  test("TypeErrorでも無関係なメッセージなら false", () => {
    expect(isNetworkFetchError(new TypeError("Cannot read properties of undefined"))).toBe(false);
  });

  test("TypeError以外(通常のErrorやPostgrestError)は false", () => {
    expect(isNetworkFetchError(new Error("Failed to fetch"))).toBe(false);
    expect(isNetworkFetchError({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(isNetworkFetchError(null)).toBe(false);
    expect(isNetworkFetchError(undefined)).toBe(false);
  });
});

describe("isPermanentReplayError", () => {
  test("PostgreSQLの制約違反系コードを恒久的エラーとして検出する", () => {
    expect(isPermanentReplayError(postgrestError("23502", 'null value in column "name"'))).toBe(
      true,
    );
    expect(isPermanentReplayError(postgrestError("23503", "violates foreign key constraint"))).toBe(
      true,
    );
    expect(isPermanentReplayError(postgrestError("23514", "violates check constraint"))).toBe(true);
    expect(
      isPermanentReplayError(postgrestError("22P02", "invalid input syntax for type uuid")),
    ).toBe(true);
    expect(
      isPermanentReplayError(postgrestError("42501", "new row violates row-level security policy")),
    ).toBe(true);
  });

  test("コードが失われた(new Error(message)でラップされた)場合もメッセージ文言から検出する", () => {
    // useShoppingList.ts の upsertShoppingItem 等は PostgrestError を
    // `throw new Error(error.message)` でラップしており、.code は失われる。
    expect(
      isPermanentReplayError(new Error('null value in column "name" violates not-null constraint')),
    ).toBe(true);
    expect(isPermanentReplayError(new Error("invalid input syntax for type integer"))).toBe(true);
  });

  test("一意制約違反(23505)は恒久的エラーとして扱わない(状況次第で回復し得るため)", () => {
    expect(isPermanentReplayError(postgrestError("23505", "duplicate key value"))).toBe(false);
  });

  test("スキーマ不一致(マイグレーション未適用)は恒久的エラーとして扱わない", () => {
    expect(
      isPermanentReplayError(postgrestError("PGRST204", "Could not find the 'expiry_type' column")),
    ).toBe(false);
  });

  test("コード・メッセージのどちらも持たないエラーは恒久的エラーとして扱わない", () => {
    expect(isPermanentReplayError(new Error("Not authenticated"))).toBe(false);
    expect(isPermanentReplayError(new OfflineError())).toBe(false);
    expect(isPermanentReplayError(null)).toBe(false);
    expect(isPermanentReplayError(undefined)).toBe(false);
  });
});
