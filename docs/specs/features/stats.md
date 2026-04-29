# Feature Spec: Stats Dashboard

## 概要

在庫と消費の状況を可視化する。
グラフライブラリは Recharts（軽量、shadcn と相性良）。

## グラフ一覧

| グラフ | 元データ | 形式 |
| --- | --- | --- |
| カテゴリ別在庫件数 | `items` を `category_id` で group | 横棒 |
| 期限ステータス分布 | `items` を `getExpiryStatus()` で group | ドーナツ |
| 月別消費量 | `consumption_logs` を `occurred_at` 月で group、`delta_amount * 単位換算` の合計 | 縦棒（直近 6 ヶ月） |

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

| hook | 機能 |
| --- | --- |
| `useCategoryStats()` | カテゴリ別件数 |
| `useExpiryDistribution()` | 期限ステータス分布 |
| `useMonthlyConsumption(months = 6)` | 月別消費 |

## エラー

- データなし: EmptyState「履歴が貯まると表示されます」
- 集計失敗: トースト

## v1.3 範囲

- 上記 3 グラフ
- 期間 / カテゴリのフィルタ最低限（カテゴリ別在庫はフィルタなし、消費は期間のみ）

## Backlog

- カテゴリ別月次消費
- 期限切れになる前に消費した割合
- 在庫推移（時系列）
- DB 側に Materialized View
