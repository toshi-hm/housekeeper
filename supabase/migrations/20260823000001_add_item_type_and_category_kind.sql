-- 食料品 / 日用品のアイテム種別を導入する（docs/specs/features/item-type.md）。
--
-- 期限（expiry_date / expiry_type）が意味を持たない日用品（洗剤・トイレット
-- ペーパー・電池など）を、期限入力なしで登録し、ダッシュボードで食料品と
-- 分けて表示できるようにするための列。
--
-- 種別は「カテゴリの既定値 + アイテム個別の上書き」の2層で持つ
-- （days_use_after_opening と同じ構造）。カテゴリ1件の切り替えで配下の
-- 既存アイテムをまとめて分類できるようにするため。

-- categories.kind: そのカテゴリに属するアイテムの既定の種別。
-- not null default 'food' なので、既存カテゴリは全て食料品扱いのままとなり
-- これまでの表示・挙動が保たれる。
alter table public.categories
  add column if not exists kind text not null default 'food'
    check (kind in ('food', 'daily_goods'));

-- items.item_type: アイテム個別の種別（カテゴリ既定の上書き）。
-- null = カテゴリの kind に従う（カテゴリ未設定なら 'food'）。既存アイテムは
-- 全て null のまま = 従来どおり食料品として扱われる。
alter table public.items
  add column if not exists item_type text
    check (item_type is null or item_type in ('food', 'daily_goods'));

-- ダッシュボードのタブ絞り込みはクライアント側（カテゴリ既定の解決が必要なため）
-- で行うので、item_type 単体の索引は追加しない。
