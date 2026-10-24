-- Data API ロール (anon / authenticated / service_role) への GRANT を明示する。
--
-- 背景: supabase/config.toml の `api.auto_expose_new_tables = true` は 2026-10-30 に廃止される。
-- これまでは public スキーマの新規テーブルへ default privileges 経由で GRANT が自動付与されており、
-- 既存マイグレーションの多くは明示的な GRANT を発行していなかった。auto-expose を外すと
-- ローカル / CI の DB (マイグレーション再生で構築) で permission denied になるため、
-- 本番 (default privileges 由来) の実効権限と同一になるよう、ここで明示する。
--
-- 方針:
-- - 本番の実効権限 (information_schema.role_table_grants) をそのまま写す。権限を広げも狭めもしない。
--   本番では全て既に付与済みなので no-op、ローカルでは不足分を補う。
-- - GRANT は冪等。個別マイグレーションで revoke 済みのテーブル (rate limit 系など) は
--   service_role のみ / 必要最小限のまま保つ。
-- - 行の可視範囲は RLS が制御する (全テーブル RLS 有効)。
-- - public スキーマに sequence / view は無い。関数の EXECUTE は各マイグレーションが明示している。

-- anon / authenticated / service_role: 全権限 (RLS で制限)
do $$
declare
  t text;
begin
  foreach t in array array[
    'categories',
    'consumption_logs',
    'floor_plan_item_placements',
    'floor_plan_storage_location_markers',
    'floor_plans',
    'item_lots',
    'item_tags',
    'items',
    'items_to_tags',
    'low_stock_notification_states',
    'meal_plans',
    'notification_logs',
    'notification_preferences',
    'push_subscriptions',
    'recipe_items',
    'recipes',
    'security_reset_attempts',
    'shopping_list_items',
    'shopping_list_template_items',
    'shopping_list_templates',
    'storage_locations',
    'user_security_questions',
    'user_settings',
    'waste_streaks'
  ] loop
    execute format('grant all on table public.%I to anon, authenticated, service_role', t);
  end loop;
end $$;

-- shopping_list_archive: INSERT はトリガー/RPC 経由のみ (anon / authenticated には与えない)
grant select, update, delete, references, trigger, truncate
  on table public.shopping_list_archive to anon, authenticated;
grant all on table public.shopping_list_archive to service_role;

-- service_role 専用 (rate limit 系・招待試行ログ。anon / authenticated は revoke 済み)
do $$
declare
  t text;
begin
  foreach t in array array[
    'barcode_rate_limits',
    'chat_rate_limits',
    'household_invite_attempts',
    'receipt_scan_rate_limits',
    'recipe_rate_limits',
    'shelf_scan_rate_limits'
  ] loop
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- authenticated に限定的な権限 + service_role 全権限
grant select, insert, delete on table public.custom_units to authenticated;
grant all on table public.custom_units to service_role;

grant select, insert on table public.household_invites to authenticated;
grant all on table public.household_invites to service_role;

grant select on table public.household_members to authenticated;
grant all on table public.household_members to service_role;

grant select on table public.households to authenticated;
grant all on table public.households to service_role;

grant select on table public.notification_failures to authenticated;
grant insert on table public.notification_failures to service_role;
