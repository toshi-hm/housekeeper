-- #419: 期限切れアイテムの自動アーカイブ（N日後に自動ソフトデリート）
--
-- サーバー常駐のcronは持たない構成のため（クライアントのみのアプリ）、実行トリガーは
-- ダッシュボード初期表示時のクライアントサイド処理（useAutoArchiveExpiredItems）が担う。
-- このカラムはその際に参照する「有効/無効 + 猶予日数」の設定値を保持するだけで、
-- サーバー側で自動実行する仕組みは持たない。
--
-- NULL = 無効（デフォルト）。1以上の整数 = 期限切れ後その日数が経過したアイテムを対象にする。
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS auto_archive_after_days INTEGER DEFAULT NULL
    CHECK (auto_archive_after_days IS NULL OR auto_archive_after_days >= 1);
