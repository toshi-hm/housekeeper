-- Add minimum_stock column to items table
-- Used for low-stock alerts on the dashboard
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS minimum_stock INTEGER DEFAULT NULL CHECK (minimum_stock IS NULL OR minimum_stock >= 0);
