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
