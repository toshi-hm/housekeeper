# Feature Spec: Stats Dashboard

## 概要

在庫と消費の状況を可視化する。
グラフライブラリは Recharts（軽量、shadcn と相性良）。

## グラフ一覧

| グラフ             | 元データ                                                                            | 形式                |
| ------------------ | ----------------------------------------------------------------------------------- | ------------------- |
| カテゴリ別在庫件数 | 在庫が残る `items`（`units > 0`）を `category_id` で group                          | 横棒                |
| 期限ステータス分布 | `items` を `getExpiryStatus()` で group                                             | ドーナツ            |
| カテゴリ別在庫金額 | `item_lots`（`unit_price` 設定済みのみ）を `item_id → category_id` で group（#342） | 横棒                |
| 月別消費量         | `consumption_logs` を `occurred_at` 月で group、`delta_amount * 単位換算` の合計    | 縦棒（直近 6 ヶ月） |

## ユーザーストーリー

- ダッシュボードとは別ルート `/_auth/stats` でアクセスできる
- 各グラフは凡例 + 期間 / カテゴリでフィルタ可能（v1.3）

## 集計方針

- v1.3 はクライアント側集計（一覧 hook で取得済みの items / logs を集計）
- データ量が増えたら DB の Materialized View に逃がす（Backlog）

## 単位換算

- 消費量集計は `delta_unit` ベースで、可能なら基準単位（mL / g / 個 / 枚）に正規化
- 不可なら単位ごとに別系列として表示

## API（hook）

| hook                                | 機能                       |
| ----------------------------------- | -------------------------- |
| `useCategoryStats()`                | カテゴリ別件数             |
| `useExpiryDistribution()`           | 期限ステータス分布         |
| `useCategoryValueStats()`           | カテゴリ別在庫金額（#342） |
| `useMonthlyConsumption(months = 6)` | 月別消費                   |

## エラー

- データなし: EmptyState「履歴が貯まると表示されます」
- 集計失敗: トースト

## v1.3 範囲

- 上記グラフ（カテゴリ別在庫件数・期限ステータス分布・月別消費量）
- 期間 / カテゴリのフィルタ最低限（カテゴリ別在庫はフィルタなし、消費は期間のみ）

## コスト管理（#342）

- 「カテゴリ別在庫金額」は `item_lots.unit_price` が設定されているロットのみを対象に集計する
  （後方互換: `unit_price IS NULL` のロットは金額不明として除外、0円扱いにはしない）。
- 単価が1件も設定されていない場合はグラフに反映されない（EmptyState は既存の「データがありません」を流用）。

## Backlog

- カテゴリ別月次消費
- 期限切れになる前に消費した割合
- 在庫推移（時系列）
- DB 側に Materialized View
