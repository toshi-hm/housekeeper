-- Enforce optional MFA at the database boundary. Users without a verified
-- factor continue to use aal1; once a factor is verified, all personal-data
-- access requires an aal2 JWT even when the Data API is called directly.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create or replace function private.mfa_access_allowed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select auth.uid()) is not null
    and (
      not exists (
        select 1
        from auth.mfa_factors
        where user_id = (select auth.uid())
          and status = 'verified'
      )
      or coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    );
$$;

revoke all on function private.mfa_access_allowed() from public;
grant execute on function private.mfa_access_allowed() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'categories',
    'consumption_logs',
    'item_lots',
    'item_tags',
    'items',
    'items_to_tags',
    'notification_logs',
    'notification_preferences',
    'push_subscriptions',
    'shopping_list_items',
    'shopping_list_template_items',
    'shopping_list_templates',
    'storage_locations',
    'user_security_questions',
    'user_settings'
  ]
  loop
    execute format('drop policy if exists mfa_aal_required on public.%I', table_name);
    execute format(
      'create policy mfa_aal_required on public.%I as restrictive for all to authenticated using ((select private.mfa_access_allowed())) with check ((select private.mfa_access_allowed()))',
      table_name
    );
  end loop;
end;
$$;

drop policy if exists mfa_aal_required on storage.objects;
create policy mfa_aal_required
  on storage.objects
  as restrictive
  for all
  to authenticated
  using (bucket_id <> 'item-images' or (select private.mfa_access_allowed()))
  with check (bucket_id <> 'item-images' or (select private.mfa_access_allowed()));
