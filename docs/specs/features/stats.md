# Feature Spec: Stats Dashboard

## 概要

在庫と消費の状況を可視化する。
グラフライブラリは Recharts（軽量、shadcn と相性良）。

## グラフ一覧

| グラフ                           | 元データ                                                                                                | 形式                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| カテゴリ別在庫件数               | 在庫が残る `items`（`units > 0`）を `category_id` で group                                              | 横棒                                    |
| 期限ステータス分布               | `items` を `getExpiryStatus()` で group                                                                 | ドーナツ                                |
| カテゴリ別在庫金額               | `item_lots`（`unit_price` 設定済みのみ）を `item_id → category_id` で group（#342）                     | 横棒                                    |
| 月別消費量                       | `consumption_logs` を `occurred_at` 月で group、`delta_amount * 単位換算` の合計                        | 縦棒（直近 6 ヶ月）                     |
| 消費速度ランキング（#68, #392）  | アイテムごとの直近 30 日間の1日あたり消費量 + 直前30日との比較トレンド                                  | 表                                      |
| フードロス（月次廃棄件数、#494） | `deletion_reason = 'expired_waste'` の `items` を `deleted_at` の月・`category_id` で group（積み上げ） | 縦棒（直近 6 ヶ月・カテゴリ別積み上げ） |

## ユーザーストーリー

- ダッシュボードとは別ルート `/_auth/stats` でアクセスできる
- 各グラフは凡例 + 期間 / カテゴリでフィルタ可能（v1.3）

## 集計方針

- v1.3 はクライアント側集計（一覧 hook で取得済みの items / logs を集計）
- データ量が増えたら DB の Materialized View に逃がす（Backlog）

## 単位換算

- 消費量集計は `delta_unit` ベースで、可能なら基準単位（mL / g / 個 / 枚）に正規化
- 不可なら単位ごとに別系列として表示

## 消費ペース予測 / 補充タイミング予測（#68, #392）

既存の `consumption_logs` から、アイテムごとの平均消費ペース（1日あたり消費量）を算出し、
現在の在庫量から「あと何日で在庫が切れるか」を予測する。`items.minimum_stock` ベースの
低在庫アラート（#230/#382）が「数量のしきい値」で警告するのに対し、こちらは「消費ペース」で
より早く・より正確に補充タイミングを知らせることを狙う。

- 計算ロジックは `src/types/stats.ts` の純粋関数として実装し、Unit Test 対象にする
  - `computeConsumptionPaceForecast(logs, currentStock, lookbackDays = 30, now)`:
    直近 `lookbackDays` 日間のうち、現在の `content_unit` と一致する消費ログから
    1日あたり平均消費量と予測残日数を計算する。単位変更前の履歴は混在させない。
    在庫が0以下なら即 `predictedRemainingDays = 0`。参照期間内のログが2件未満、または
    合計消費量が0以下の場合は「データ不足」として `dailyRate` / `predictedRemainingDays` は
    `null`（`logCount` のみ返す。UI では「データ不足（X回分の消費記録あり）」と表示する）
  - `computeConsumptionSpeedRanking(logs, windowDays = 30, now)`: アイテムごとに直近
    `windowDays` 日間の消費ペースで降順ソートし、その1つ前の `windowDays` 日間との比較で
    `accelerating`（加速中）/ `decelerating`（減速中）/ `steady`（横ばい）/
    `insufficient-data`（比較不能）を判定する
  - `computeForecastAlerts(items, logs, thresholdDays, lookbackDays = 30, now)`: 在庫がある
    アイテムのうち予測残日数が `thresholdDays` 以内のものを、予測残日数の短い順（=急ぐ順）に返す
- 表示箇所:
  - アイテム詳細ページ（`/_auth/items/$itemId`）: 在庫情報の近くに「予測残日数」を表示
    （例:「現在の消費ペースだと約14日分の在庫があります」）。在庫が0の場合は非表示
  - ダッシュボード（`/_auth/`）: 予測残日数が `user_settings.low_stock_forecast_days`
    （デフォルト 7 日）以内のアイテムを、期限アラート・低在庫アラート（minimum_stock）とは
    別の警告バナーとしてまとめて表示する。`minimum_stock` バナーに既に載っているアイテムは
    重複表示しない（補完する）
  - 統計ページ（`/_auth/stats`）: 消費速度ランキング表（上記グラフ一覧を参照）

## API（hook）

| hook                                          | 機能                             |
| --------------------------------------------- | -------------------------------- |
| `useCategoryStats()`                          | カテゴリ別件数                   |
| `useExpiryDistribution()`                     | 期限ステータス分布               |
| `useCategoryValueStats()`                     | カテゴリ別在庫金額（#342）       |
| `useMonthlyConsumption(months = 6)`           | 月別消費                         |
| `useConsumptionSpeedRanking(windowDays = 30)` | 消費速度ランキング（#68, #392）  |
| `useForecastAlerts(items, thresholdDays)`     | 予測残日数が閾値以内のアイテム   |
| `useWasteStats(months = 6)`                   | 月別廃棄件数（カテゴリ別、#494） |

## エラー

- データなし: EmptyState「履歴が貯まると表示されます」
- 集計失敗: トースト

## v1.3 範囲

- 上記グラフ（カテゴリ別在庫件数・期限ステータス分布・月別消費量）
- 期間 / カテゴリのフィルタ最低限（カテゴリ別在庫はフィルタなし、消費は期間のみ）

## コスト管理（#342）

- 「カテゴリ別在庫金額」は `item_lots.unit_price` が設定されているロットのみを対象に集計する
  （後方互換: `unit_price IS NULL` のロットは金額不明として除外、0円扱いにはしない）。
- 開封済みロットは `units - 1 + opened_remaining / content_amount` 相当の点数で按分する。
- 削除・アーカイブ済みアイテムのロットは集計対象外とする。
- 単価が1件も設定されていない場合はグラフに反映されない（EmptyState は既存の「データがありません」を流用）。

## フードロスダッシュボード（#494）

- `items.deletion_reason = 'expired_waste'`（ソフトデリート時に「期限切れで廃棄した」を選択したアイテム）のみを対象に、月別・カテゴリ別の件数を積み上げ棒グラフで表示する
- 削除理由は `deletion_reason` カラムの仕様（`docs/specs/database.md`）参照。UI 側は `items.deleted_at` をセットする箇所（アイテム詳細の削除、ダッシュボードの一括削除）で `DeletionReasonDialog`（molecule）を使って選択させる
- 廃棄時点の推定残量は専用カラムを持たず、ソフトデリートで変更されない `units` / `content_amount` / `opened_remaining` から都度算出できる
- **金額換算は未実装**: `items.unit_price`（#342）がマージされ次第、`WasteStatsChart` に推定廃棄金額を追加する。本実装時点では #342 が `main` 未マージのため件数のみを表示している
- カレンダーの期限チェック操作（`useCalendarConsume`）は `items.deleted_at` を変更せず、ロットを `consumption_logs` へ記録するだけの別経路のため、本ダッシュボードの集計対象外

## Backlog

- カテゴリ別月次消費
- 期限切れになる前に消費した割合
- 在庫推移（時系列）グラフ（消費ペース予測・消費速度ランキングとは別に、在庫数そのものの
  時系列推移を可視化するグラフは引き続き Backlog）
- DB 側に Materialized View
- フードロスダッシュボードの推定廃棄金額（unit_price 連携、#342 マージ後）
