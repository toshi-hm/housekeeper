-- Add deletion_reason to items table (#494)
--
-- Distinguishes *why* an item was soft-deleted (items.deleted_at set):
--   - 'consumed'       : fully used up
--   - 'expired_waste'  : expired and discarded without being used
--   - 'other'          : any other reason
-- Nullable because existing soft-deleted rows (and any future deletion path
-- that doesn't ask for a reason) have no reason recorded. Powers the
-- monthly food-waste dashboard (WasteStatsChart), which only counts rows
-- where deletion_reason = 'expired_waste'.
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT
  CHECK (deletion_reason IS NULL OR deletion_reason IN ('consumed', 'expired_waste', 'other'));
