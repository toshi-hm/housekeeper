-- Add timezone column to notification_preferences (#660)
-- notify_at（通知時刻）はこれまでJST固定の前提で比較されていた。IANAタイムゾーン
-- 文字列を保持し、既存ユーザーの挙動を変えないよう既定値は現状と同じ Asia/Tokyo にする。
alter table notification_preferences
  add column if not exists timezone text not null default 'Asia/Tokyo';
