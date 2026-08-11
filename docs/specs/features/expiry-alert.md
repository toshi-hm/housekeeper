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

## 賞味期限 / 消費期限の区別（#714）

日本の食品表示は「賞味期限」（best-before, 品質の目安 = 過ぎても食べられることが多い）と
「消費期限」（use-by, 安全性の目安 = 過ぎたら食べない方がよい）を区別する。以前は全ての
`expiry_date` を一律に扱っていたため、賞味期限切れの通知が消費期限切れと同じ強さで届き
アラート疲れを招いていた。

- `items.expiry_type text check (expiry_type in ('best_before','use_by')) null`
  （マイグレーション: `20260801000001_add_expiry_type_to_items.sql`）。
  **nullable、デフォルト `null`**（後方互換 — 既存アイテムは区別なしのまま）
- `ItemForm` に `ExpiryTypeSelect` atom（未設定 / 賞味期限 / 消費期限の3択セグメントコントロール）
  を追加。デフォルトは未設定（カテゴリ別デフォルト `categories.default_expiry_type` は
  未実装 — Backlog参照）
- 表示側は `getExpiryStatus`（`src/types/item.ts`）の4状態契約（expired/expiring-soon/
  ok/unknown）を変更せず維持し、`expiry_type` による表示の強弱は新設の
  `getExpirySeverity(status, expiryType)` が別途担う:
  - `expired` + `use_by`（または未設定 `null`、既存アイテム互換）→ `danger`（従来通りの赤バッジ）
  - `expired` + `best_before` → `caution`（amber/警告色。「品質の目安超過」と表示し、
    安全性の問題であるかのような文言にしない）
  - `expiring-soon` は区別に関わらず `warning`
  - `ExpiryBadge` atom がこの重大度に応じてバッジの色・文言を出し分ける
  - ダッシュボードの期限バナー（`_auth.index.tsx`）の「期限切れ」内訳リストは、
    `best_before` の item にのみ「（賞味期限：品質の目安）」の注記を添える
    （消費期限/未設定は従来通りの表示のまま）
- 通知 Edge Function（`supabase/functions/send-expiry-notifications/index.ts`）は、
  対象 item に `use_by`（または未設定）が1件でも含まれる場合は従来通りの文言、
  `best_before` のみで構成される場合は穏やかな文言（品質の目安）にタイトル・本文を出し分ける。
  時刻一致判定（`scheduled` 分岐）等の既存ロジックは変更していない

## 開封後の消費期限リマインダー（#752）

マヨネーズ・開封後の乳製品・ソースのように「開封後は印字期限より早く傷む」食品は、
`expiry_type`（賞味期限/消費期限）だけでは表現できない。開封してからの経過日数を
別枠でアラートするための最小限の仕組みを追加した。

### データモデル

- `item_lots.opened_at timestamptz null`: そのロットが最初に開封された日時。
  `opened_remaining` が最初に非nullになったタイミングで自動的にセットされる
  （DBトリガー `item_lots_set_opened_at`、`item_lots_set_opened_at()` 関数）。
  再び未開封相当（`opened_remaining = null`）に戻ると自動的にクリアされる。
  アプリ側のコード（`consumeLot` / `restoreLotConsumption` / `updateLot` / カレンダーの
  ゼロ化操作など、すべて `item_lots` への直接 INSERT/UPDATE を経由する）は
  この列を明示的に書き込む必要がない。
- `items.opened_at timestamptz null`: `item_lots` からの集計値。`syncItemAggregate`
  （`src/hooks/useItemLots.ts`）が、現在アクティブ（残量あり）かつ現在開封中の
  ロットのうち最も古い `opened_at` を都度再計算して書き込む（`expiry_date` の
  「最も近い期限を採用」と同じ考え方）。ロットを経由しないレガシー経路
  （`useConsumeItem.ts` の "direct" フォールバック、ロットがまだ存在しないアイテムの
  クイック消費）は、同じ null↔非null遷移ロジックをアプリ側で個別に再現している。
- `items.days_use_after_opening integer null` / `categories.days_use_after_opening integer null`:
  開封後使用推奨日数。アイテム個別設定が優先され、未設定なら
  カテゴリの既定値にフォールバックする（`resolveOpenedAlertThresholdDays`,
  `src/types/item.ts`）。どちらも未設定ならこの機能自体を使わない（`null`）。

### 表示

- `OpenedAlertBadge` atom（`src/components/atoms/OpenedAlertBadge.tsx`）: 開封日時から
  推奨日数以上経過している場合にのみ表示するセカンダリバッジ。`ExpiryBadge`
  （賞味期限/消費期限）とは完全に独立しており、両方が同時に表示されることもある。
  判定ロジックは純関数 `isOpenedAlertDue`（`src/types/item.ts`）に切り出してある。
- ダッシュボード（`ItemCard` / `ItemListRow`）とアイテム詳細ページで `ExpiryBadge` の
  隣に表示する。ダッシュボードは `categories` を id 引きした `Category` を渡し、
  各コンポーネントは呼び出し元が解決済みの `openedAlertThresholdDays` を受け取るだけで、
  カテゴリ一覧を自前で持たない（`categoryName` 等、既存の解決済みprops方式を踏襲）。
- 設定UI: `ItemForm` に「開封後使用推奨日数」の数値入力（任意、1以上の整数）。
  カテゴリ設定ページ（`/settings/categories`）にも同名フィールドを追加し、
  カテゴリ単位の既定値を設定できる。

### 既知の制約

- `items.opened_at` に対しては DB トリガーを付けていない（`item_lots` とは異なり、
  「直前の書き込みからの単純な遷移」ではなく「現在アクティブな全ロットの中で
  最も古い `opened_at`」を都度再計算する必要があるため、同じトリガーを付けると
  `syncItemAggregate` が計算した正しい値を誤って上書きしてしまう）。そのため
  `items` を直接更新するコード経路が新たに増えた場合は、この集計ロジックを
  手動で踏襲する必要がある。
- JSONバックアップのエクスポート/インポート（`docs/specs/features/consumption-purchase.md`
  参照）は `opened_at` を往復させない。将来インポート機能を実装する際は、
  素朴な `insert` だとトリガーが `opened_at` を「インポート実行時刻」に
  上書きしてしまう点に注意が必要（現状インポート機能自体が未実装のため影響なし）。

## Backlog

- カテゴリ別のデフォルト期限種別（`categories.default_expiry_type`）— `ItemForm` の
  カテゴリ選択時に `expiry_type` を自動プリセットする
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
