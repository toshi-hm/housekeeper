-- #697: Track the store an item_lots row was purchased at so users can
-- compare prices for the same item across stores. Free-text (no `stores`
-- master table for now, per docs/specs/features/consumption-purchase.md
-- "購入先（店舗）記録と店舗別価格比較"), nullable so existing lots stay
-- untouched (backward compatible).
alter table public.item_lots
  add column if not exists store_name text;
