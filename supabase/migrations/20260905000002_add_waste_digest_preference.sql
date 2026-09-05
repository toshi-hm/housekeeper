-- notification_preferences に週次食品ロスダイジェストの受信可否を追加（#925）
--
-- 配信曜日（月曜固定）・時刻は既存の notify_at を流用し（spec の「やらないこと」）、
-- 専用のON/OFFのみを追加する。デフォルトは無効（opt-in）。
alter table notification_preferences
  add column waste_digest_enabled boolean not null default false;
