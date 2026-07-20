-- Add unit_price column to item_lots table (#342)
-- Records the purchase price per unit (yen, integer) for cost tracking /
-- inventory value visibility. NULL means "not set" for backward
-- compatibility with existing rows.
ALTER TABLE item_lots
  ADD COLUMN IF NOT EXISTS unit_price INTEGER DEFAULT NULL CHECK (unit_price IS NULL OR unit_price >= 0);
