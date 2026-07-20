# Feature Spec: Expiry Alert

## 概要

消費期限の近い / 切れたアイテムを視覚的に強調する。
通知配信は別 spec（`notifications.md`）。本 spec は **UI 表示** にフォーカス。

## ステータス定義

| 状態            | 条件                                              |
| --------------- | ------------------------------------------------- |
| `expired`       | `expiry_date < today`                             |
| `expiring-soon` | `0 <= today - expiry_date` の `今日〜閾値日` 以内 |
| `ok`            | それ以降の日付                                    |
| `unknown`       | `expiry_date` が未設定                            |

閾値は `user_settings.expiry_warning_days`（デフォルト 3）。
ロジックは `src/types/item.ts:getExpiryStatus` を **`expiry_warning_days` を引数に取る形に拡張** する。

```ts
export const getExpiryStatus = (
  expiryDate: string | null | undefined,
  warningDays: number,
): ExpiryStatus => { ... }
```

## ユーザーストーリー

- ダッシュボードで期限切れ / 近接の合計件数がバナーで分かる
- カードバッジで個別 item の状態が一目で分かる
- 期限が近いものを 1 タップで絞り込める（FilterChips）
- 期限ステータス順にソートできる

## 画面

- `ExpiryBadge` atom: 4 状態（expired / expiring-soon / ok / unknown）
- `ExpiryBanner` organism: ダッシュボード上部、`urgentCount > 0` で表示
- `FilterChips`: `expired` / `expiring-soon` のチップでフィルタ

## エラー

- `expiry_date` が無効な文字列の場合は `unknown` 扱い
- タイムゾーン: クライアントのローカル日付で判定（UTC に揃えない）

## v1 範囲

- 閾値を `user_settings` に逃がす
- `getExpiryStatus` の境界テストを `bun test` で追加
- `FilterChips` で期限ステータスフィルタ

## 自動アーカイブ（#419）

期限切れアイテムが溜まり続けると `urgentCount` バナーが常時表示になり、アラート疲れを招く。
これを軽減するため、期限切れから一定日数経過したアイテムを自動的にソフトデリート
（`items.deleted_at` セット）するオプション機能を持つ。

- 設定: `user_settings.auto_archive_after_days`（`int | null`）。`null` = 無効（デフォルト）。
  設定ページの「期限切れアイテムの自動アーカイブ」セクションで ON/OFF と日数（1〜365）を変更する。
- **実行トリガー: クライアントサイド**。本アプリはサーバーを持たないため（`CLAUDE.md` の制約）、
  サーバーcronではなく `useAutoArchiveExpiredItems`（`src/hooks/useAutoArchive.ts`）が
  ダッシュボード（`/_auth/index`）の初期表示時に一度だけ実行する。
  - オフライン時（`navigator.onLine === false`）は待機し、同じ画面でオンラインへ戻った時点で再試行する
  - DB の `auto_archive_expired_items()` が設定値と対象行を同一トランザクション内で再確認する。
    「`units > 0`、未削除、`expiry_date` がサーバー日付から設定日数以上前」の全条件を更新時にも
    満たす行だけをアーカイブし、画面での取得後に別端末から編集された行を誤って削除しない
  - 対象アイテムを一括ソフトデリートした後、「N件のアイテムをアーカイブしました」トースト
    ＋「元に戻す」アクションを表示する（トーストは5秒で自動的に消える＝実質的な取り消し猶予）。
    Undo は同じ自動アーカイブ時刻の行だけを復元し、その後に行われた別の削除操作を取り消さない
- アーカイブ済み（ソフトデリート済み）アイテムは設定ページの「アーカイブ済みアイテム」
  （`/settings/archived-items`）から一覧・復元できる。既存の `items.deleted_at` ソフトデリート
  基盤（`useSoftDeleteItem` / バーコード再スキャンによる `tryReviveItem` 等）をそのまま流用し、
  復元専用の `useRestoreItem` / `useDeletedItems`（`src/hooks/useItems.ts`）を追加した。

## Backlog

- 「賞味期限」と「消費期限」の区別（UX 上の重要度を分ける）
- カテゴリ別に閾値を変える

## 外部レシピ提案（#461）

期限切れ / 期限間近アイテムを使い切るための外部レシピ検索をダッシュボードでサジェストする。

**注意**: これは #393（`recipes`/`recipe_items` テーブルを持つ、ユーザー定義の「レシピ/セット消費」機能。
`/recipes` ルート）とは別物。#393 はユーザーが自分で登録したレシピをワンタップ消費するための DB 機能、
本機能はアイテム名をもとに**外部API**からレシピ候補を検索して見せるだけの機能で、DBテーブルを持たない。

### 処理フロー

1. `DashboardPage` が `urgentItems`（`expired` / `expiring-soon` かつ `units > 0`）の商品名を先頭5件まで抽出
2. `useRecipeSuggestions(itemNames)`（`src/hooks/useRecipeSuggestions.ts`, TanStack Query）が
   Edge Function `recipe-suggest` を呼ぶ。結果は `staleTime` 長め（6時間）でキャッシュする
3. Edge Function は `barcode-lookup` と同じ CORS 回避パターン（authチェック → 外部API呼び出し →
   レスポンス整形）を踏襲し、外部レシピ検索API（例: 楽天レシピAPI等）にアイテム名を渡す
4. 結果は `ExpiryRecipeSuggestions` molecule（`src/components/molecules/ExpiryRecipeSuggestions.tsx`）
   として `ExpiryBanner` 付近に表示する

### API

```
POST /functions/v1/recipe-suggest
body: { itemNames: string[] }   // 1〜5件、空文字・重複・101文字以上は除外
res:  { recipes: { id, title, url, imageUrl }[], reason?: "missing_api_key" }
```

Edge Function 実装: `supabase/functions/recipe-suggest/index.ts`
（外部API呼び出し本体・整形ロジックは `recipe.ts` にDI可能な形で分離し、Deno単体テストを容易にしている）

### 必要なSecret

- `RECIPE_API_KEY`: 外部レシピ検索APIのアプリケーションキー。**未設定時は例外を投げず、
  `{ recipes: [], reason: "missing_api_key" }` を返してソフトデグレードする**（`barcode-lookup` の
  `YAHOO_SHOPPING_APP_ID` 未設定時と同様の考え方）。Supabase の Secrets に設定が必要
  （`supabase secrets set RECIPE_API_KEY=...`）。未設定でもアプリは壊れず、レシピ提案が非表示になるだけ

### エラー / 空データ

- `itemNames` が空（期限切れ/期限間近アイテムなし） → hook 自体を `enabled: false` にして呼ばない
- `RECIPE_API_KEY` 未設定・外部API呼び出し失敗・タイムアウト（8秒） → いずれも `{ recipes: [] }` を返す
  （HTTPステータスは 200 のまま。これは `barcode-lookup` が 5xx を返すのと異なり、任意のサジェスト機能で
  あるため、クライアント側でエラーハンドリングを分岐させないための意図的な設計）
- `ExpiryRecipeSuggestions` は `suggestions` が空配列のときは何も描画しない（バナーが出ない = 静かに機能degrade）

## v1.3 範囲

- 上記の外部レシピ提案（本セクション）
