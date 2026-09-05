# Feature Spec: 食品ロス削減ダッシュボード＆週次ダイジェスト通知

> 親 Issue: #925

## 概要

既存の統計ページ（`useWasteStats` / `computeMonthlyWasteStats`、`src/hooks/useStats.ts`
/ `src/types/stats.ts`）は「見に行けば数字が見える」受動的な情報止まりで、行動変容に
つながる後押しがない。既存集計をベースに、週次ダイジェスト通知と継続記録（ストリーク）
表示を追加する。

## スコープ

- やること:
  - 週次で「先週は◯件廃棄（前週比±%）」「よく廃棄しがちな食材トップ3」をまとめた
    ダイジェストを、既存の通知配信基盤（Web Push / Email、`send-expiry-notifications`
    と同様の Edge Function + `pg_cron` パターン）で配信する新規 Edge Function
    `send-waste-digest` を追加する
  - 統計ページに「連続◯週間ロスゼロ」のストリーク表示を追加する
  - ストリーク記録用の小さいテーブル（`waste_streaks`、1 user 1 行、
    `current_streak_weeks int`, `longest_streak_weeks int`, `last_evaluated_week date`）
    を新設する
- やらないこと:
  - 既存の `computeMonthlyWasteStats` の集計ロジック自体は変更しない（週次ダイジェスト
    はこれを週単位に再集計するラッパーを新設するのみ）
  - ダイジェストの配信頻度・時刻のユーザー設定 UI は v1 では作らない（既存の
    `notification_preferences.notify_at` を流用し、配信曜日は月曜固定とする）

## ユーザーストーリー

- 毎週月曜の朝、先週の廃棄状況を通知で受け取り、多い食材を意識できる
- 統計ページで「今週で3週連続ロスゼロ」のような継続記録を見てモチベーションになる

## 画面

- 統計ページ（`StatsPage`）に `WasteStreakBadge` atom（連続週数表示）を追加
- 通知本文（Push / Email 共通のテンプレート、`send-expiry-notifications` の
  本文生成パターンを踏襲）に「先週の廃棄件数」「前週比」「廃棄トップ3食材」を含める

## データへの影響

- 新規テーブル `waste_streaks`（RLS: `auth.uid() = user_id`）
- 既存 `consumption_logs`（廃棄種別の delta）を週次集計する新規関数
  `computeWeeklyWasteDigest` を `src/types/stats.ts` に追加

## エラー

- 直近の消費ログが無い（新規ユーザー等）場合はダイジェスト送信をスキップする
  （既存の `send-expiry-notifications` の「対象0件ならスキップ」方針と同様）
- ストリーク評価は週次バッチ実行時のみ更新し、クライアント側では再計算しない
  （複数デバイスでの二重カウントを避ける）

## 対象範囲（v1）

- 新規 Edge Function `send-waste-digest`（`pg_cron` 週次、月曜 8:00 相当）
- `waste_streaks` migration + 週次バッチでの更新ロジック
- `WasteStreakBadge` atom + Story
- 通知設定画面に「週次ダイジェストを受け取る」トグルを追加
  （既存 `NotificationSettings` organism に1項目追加）

## 工数目安

M（既存の統計計算・通知配信基盤を再利用できるが、ダイジェスト生成ロジックと
ストリーク管理が新規）
