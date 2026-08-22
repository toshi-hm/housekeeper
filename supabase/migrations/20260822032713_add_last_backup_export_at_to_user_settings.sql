-- Add last_backup_export_at column to user_settings (#815)
-- This product has no server-side backup (client-side-only, RLS-scoped Supabase
-- access — see docs/specs/features/consumption-purchase.md "インポート（復元）"),
-- so the manual JSON export in DataExportPanel is the user's only backup/recovery
-- path. This column records when that JSON export last succeeded, so the
-- dashboard can remind the user when it hasn't run in a while.
alter table user_settings
  add column if not exists last_backup_export_at timestamptz;
