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

/**
 * #1022: fetch自体が失敗した（DNS解決不可・接続不可・タイムアウト等）ことを示す
 * ネットワークエラーかどうか。ブラウザの `fetch()` はネットワークレベルの失敗を
 * `TypeError` で reject する（Chrome/Edge: "Failed to fetch"、Firefox:
 * "NetworkError when attempting to fetch resource."）。`supabase-js` はこれらを
 * 特別なエラー型にラップせず、内部の `fetch()` 呼び出しが reject した
 * `TypeError` をそのまま呼び出し元へ伝播させる。
 *
 * `navigator.onLine` は「OS/ブラウザがネットワークインターフェースを検出しているか」
 * の粗い判定でしかなく、弱電波・輻輳等で実際の通信が失敗していても `true` の
 * ままのことがあるため、`queuePurchase`/`queueAddAlert`（`useOfflineActionQueue.ts`）
 * では `navigator.onLine` の事前チェックに加えて、実行時にこの判定でも
 * オフラインキューへの振り分けを行う。`useBarcodeLookup.ts` の `isNetworkError`
 * と同じ判定方針（メッセージに `fetch`/`network` を含むかどうか）。
 */
export const isNetworkFetchError = (error: unknown): boolean => {
  if (!(error instanceof TypeError)) return false;
  const message = error.message.toLowerCase();
  return message.includes("fetch") || message.includes("network");
};

/**
 * #1021: PostgreSQLの制約違反系エラーコード。同じペイロードで再送しても
 * 決定的に同じ結果（失敗）になるため「恒久的」に分類する対象。
 */
const PERMANENT_VALIDATION_CODES = new Set([
  "23502", // not_null_violation
  "23503", // foreign_key_violation
  "23514", // check_violation
  "22P02", // invalid_text_representation（invalid input syntax）
  "42501", // insufficient_privilege（RLS拒否）
]);

/**
 * 上記コードに対応する Postgres エラーメッセージの文言。`src/hooks/useShoppingList.ts`
 * の多くの呼び出し（例: `upsertShoppingItem` の最終的な `throw new Error(error.message)`）
 * は PostgrestError をそのまま投げず `new Error(error.message)` でラップしており、
 * その過程で `.code` が失われる。メッセージ文言自体は保持されるため、コードが
 * 取れない場合のフォールバックとして使う。
 */
const PERMANENT_VALIDATION_MESSAGE_PATTERNS = [
  /violates not-null constraint/i,
  /violates foreign key constraint/i,
  /violates check constraint/i,
  /invalid input syntax/i,
  /violates row-level security policy/i,
];

/**
 * #1021: オフラインキューのリプレイ（`useOfflineActionQueue.ts` の `replay`）で
 * 「恒久的に失敗し続ける」と判断できるエラーかどうか。
 *
 * 判定基準は意図的に保守的（狭い許可リスト方式）にしている — 誤って一時的な
 * エラー（ネットワーク瞬断・サーバー一時エラー・未ログイン等）を「恒久的」と
 * 判定してしまうと、リトライすれば成功するはずのユーザー操作（購入確定・
 * 買い物リストへの追加）を取り消し不能に失ってしまうため。上記の制約違反系
 * コード・メッセージのどちらかで確実に判別できる場合のみ `true` を返す。
 *
 * 意図的に含めないもの（誤検知のリスクが高いため）:
 * - `isSchemaMismatchError`（マイグレーション未適用）: DB側のデプロイ運用課題で
 *   あり、後からマイグレーションが適用されれば同じ操作が成功し得るため、
 *   「同じ操作は永久に失敗する」とは言い切れない
 * - 一意制約違反（23505）: `upsertShoppingItem` が内部で重複行への再取得・
 *   マージのリトライを既に試みた上で失敗しているケースを含み、状況（他の
 *   キュー内アクションの実行順序等）次第で結果が変わり得る
 * - コード・メッセージのどちらも持たない `Error`（例: `"Not authenticated"`）:
 *   セッション再取得等で回復し得るため、判別できない以上は一時的エラー扱いの
 *   まま残す（＝キューに残してリプレイを打ち切り、次回に委ねる）
 */
export const isPermanentReplayError = (error: unknown): boolean => {
  if (hasErrorCode(error) && PERMANENT_VALIDATION_CODES.has(error.code)) return true;
  const message = error instanceof Error ? error.message : undefined;
  if (!message) return false;
  return PERMANENT_VALIDATION_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));
};
