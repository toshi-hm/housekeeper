-- Add "auto reorder" settings to items (#353)
-- auto_reorder: 定期購入フラグ。true の場合、消費操作で units が
--   reorder_threshold 以下になったタイミングで shopping_list_items へ自動追加する。
-- reorder_threshold: 自動追加のしきい値。NULL の場合は 0 以下（在庫切れ）を意味する。
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS auto_reorder BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reorder_threshold INTEGER
    CHECK (reorder_threshold IS NULL OR reorder_threshold >= 0);
