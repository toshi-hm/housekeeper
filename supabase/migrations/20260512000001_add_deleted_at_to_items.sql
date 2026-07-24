-- items.deleted_at is read by the backfill query in
-- 20260513000001_create_item_lots.sql (`where deleted_at is null`) but was
-- never added by any migration, so a full replay from an empty database
-- fails with "column deleted_at does not exist". Add it here, before that
-- migration runs.
alter table items add column if not exists deleted_at timestamptz;
