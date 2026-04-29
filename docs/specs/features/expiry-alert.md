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

## Backlog

- 「賞味期限」と「消費期限」の区別（UX 上の重要度を分ける）
- カテゴリ別に閾値を変える
