-- Add low_stock_forecast_days column to user_settings (#68, #392)
-- 消費ペースからの予測残日数がこの日数以内になったら、ダッシュボードで警告バナーに含める閾値。
-- 既存の items.minimum_stock ベースの低在庫アラート（#230/#382）とは独立した設定。
alter table user_settings
  add column if not exists low_stock_forecast_days int not null default 7
  check (low_stock_forecast_days >= 0);
