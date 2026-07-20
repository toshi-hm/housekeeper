-- 棚卸し（在庫確認）機能 (#375)
-- items.last_verified_at: 最終確認日時を記録し、詳細ページの「在庫確認済み」ボタンで更新する
-- user_settings: 未確認アラートの ON/OFF としきい値日数（デフォルト90日）
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS stocktake_alert_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stocktake_alert_days INTEGER NOT NULL DEFAULT 90 CHECK (stocktake_alert_days >= 1);
