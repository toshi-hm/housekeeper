/**
 * Supabase (PostgREST / Postgres) エラーの分類ヘルパー。
 *
 * 目的は「DB が持っていないものをアプリが要求した」ケースを、通常の
 * 「エラーが発生しました」から切り出して見分けられるようにすること。
 * supabase/migrations 配下のマイグレーションが本番プロジェクトへ適用されて
 * いないままフロントエンドだけがデプロイされると、新しい列を含む INSERT /
 * UPDATE は PostgREST のスキーマキャッシュ段階で弾かれる。原因が
 * 「マイグレーション未適用」であることを画面から判別できないと、
 * 保存できない理由がユーザー側から一切分からない。
 */

/** DBスキーマとアプリの期待がずれているときに返るコード。 */
const SCHEMA_MISMATCH_CODES = new Set([
  // PostgREST: 送信した列 / RPC がスキーマキャッシュに存在しない
  "PGRST202",
  "PGRST204",
  // Postgres: undefined_column / undefined_table / undefined_function
  "42703",
  "42P01",
  "42883",
]);

interface CodedError {
  code: string;
}

const hasErrorCode = (error: unknown): error is CodedError =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  typeof (error as { code: unknown }).code === "string";

/**
 * 「アプリが要求したスキーマが DB 側に無い」エラーかどうか。
 *
 * 典型的には supabase/migrations の適用漏れ（本番 DB がリポジトリより古い）で、
 * アプリ側のリトライでは回復しない。
 */
export const isSchemaMismatchError = (error: unknown): boolean =>
  hasErrorCode(error) && SCHEMA_MISMATCH_CODES.has(error.code);
