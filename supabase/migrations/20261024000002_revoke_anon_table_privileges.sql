-- anon から public テーブルの権限を全て剥がす。
--
-- 背景: 旧 auto-expose (default privileges) により、anon が 24 テーブルへ全権限を持っていた
-- (20261024000001 で本番の実効権限をそのまま写した分)。アプリは認証必須で anon によるテーブル
-- アクセスは無く、RLS 任せの過剰権限だったため、多層防御として明示的に剥がす。
-- 冪等。authenticated / service_role の権限は変えない。
revoke all on all tables in schema public from anon;
