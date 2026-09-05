# Feature Spec: 月次予算超過アラート

> 親 Issue: #991

## 概要

`docs/specs/stats.md` には既に月別支出グラフ（`item_lots.unit_price * purchased_units`
の月集計、#633）があり、支出データの集計基盤は揃っている。しかし予算上限や超過
アラートの概念は存在しない。既存機能・提案（CSVエクスポート・店舗別価格比較・
食品ロスダッシュボード）はすべて「振り返り」系であり、「使いすぎを事前に知る」
機能を追加する。

## スコープ

- やること: `user_settings` に月次予算の上限値を保持できるようにし、当月の支出が
  予算に対してどの程度かをダッシュボードで可視化する
- やらないこと: v1 はダッシュボード内表示のみとし、通知基盤（Push/Email）との
  統合は別 Issue（Backlog）とする。カテゴリ別の予算内訳（食費だけ、日用品だけ等）
  は v1 では作らない（世帯全体の単一上限のみ）

## ユーザーストーリー

- 設定画面で月次予算上限（例: 30,000円）を入力する
- ダッシュボードで「今月の支出は予算の85%です」のようなバナーを見て、
  使いすぎに気づく

## 画面

- `SettingsPage` に予算入力欄（数値、任意設定・未設定なら非表示）を追加
- ダッシュボードの `ExpiryBanner` と同様の位置に `BudgetBanner` organism
  （新規）を追加。しきい値は既存の期限アラートバッジの配色規約に倣い、
  80%未満は通常表示、80%以上は注意色、100%超過は警告色にする

## データへの影響

- migration: `user_settings.monthly_budget numeric null` 追加（デフォルト
  `null` = 未設定 = 非表示）
- 既存の月別支出集計ロジック（`docs/specs/stats.md` #633）を再利用する新規
  `useBudgetStatus()` hook を追加（当月分のみ集計）

## エラー

- `monthly_budget` が未設定の場合は `BudgetBanner` 自体を表示しない
  （予算機能を使わないユーザーへの影響ゼロ）
- 入力値のバリデーション（0以上の数値、Zod）は既存の `userSettingsSchema` に
  沿って追加する

## 対象範囲（v1）

- migration: `user_settings.monthly_budget`
- `useBudgetStatus()` hook（既存の月別支出集計ロジックの当月抽出ラッパー）
- `BudgetBanner` organism + Story
- `SettingsPage` に予算入力欄を追加
- i18n（`common` または `stats` 名前空間に予算関連キーを追加）

## 工数目安

M
