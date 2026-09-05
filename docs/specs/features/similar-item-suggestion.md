# Feature Spec: 類似アイテム名のマージ提案（表記揺れ対策）

> 親 Issue: #990

## 概要

`docs/specs/features/master-data.md` はカテゴリ・保管場所を自由文字列からマスタ
テーブル化した理由として表記揺れ（「冷蔵庫」/「れいぞうこ」）を挙げているが、
`items.name` は今も自由入力のままで名寄せの仕組みが存在しない。表記揺れがあると
月別消費量・消費速度ランキング（`useMonthlyConsumption` / `useConsumptionSpeedRanking`）
やレシピ提案でアイテムが名前ごとに分断され、精度が下がる。

## スコープ

- やること: `ItemForm`（`src/components/organisms/ItemForm.tsx`）の name 入力時に、
  既存の `useItems()` 一覧に対しクライアント側の簡易類似度判定（正規化 + Levenshtein
  距離、外部 API 不要）を行い、「似たアイテム『たまねぎ』が既にあります」という
  気づきを与える `Alert` を表示する新規 molecule `SimilarItemSuggestion` を追加する
- やらないこと: v1 はサジェスト表示のみに留め、実データのマージ（`item_lots` の
  付け替え等）は別 Issue（Backlog）とする。表記揺れの自動正規化（かな/カナ統一等）
  も v1 では行わない（判定ロジック内部の前処理としてのみ使う）

## ユーザーストーリー

- 新規登録フォームで商品名を入力すると、既存の似た名前のアイテムがあれば
  インラインで気づかせてくれる
- 気づいたユーザーは、意図的であれば無視して登録を続けられる（ブロックしない）

## 画面

- `SimilarItemSuggestion` molecule: name フィールド直下、デバウンス後（既存の
  `VoiceInputButton` 等と同様、入力体験を阻害しないタイミング）に表示する
  非モーダル `Alert`。クリックで対象の既存アイテム詳細へ遷移するリンクを含む

## データへの影響

なし。既存 `useItems()` の読み取りのみ、クライアント側判定。

## エラー

- 類似度判定は同期的なクライアント計算のため、失敗時のエラーハンドリングは
  不要（判定不能なら単に非表示にする）
- 既存アイテム数が多い場合の計算コストは、正規化後の文字列長でのフィルタリング
  など軽量な事前絞り込みで許容範囲に抑える

## 対象範囲（v1）

- `SimilarItemSuggestion` molecule + Story + 単体テスト（判定ロジック含む）
- `src/lib/similarItemMatch.ts`（正規化 + Levenshtein 距離実装、新規）
- `ItemForm` への組み込み（新規登録時のみ、編集時は対象外）

## 工数目安

S〜M
