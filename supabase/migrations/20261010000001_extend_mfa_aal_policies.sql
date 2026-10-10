-- #1209: extend the aal2 requirement (see 20260720092622_enforce_mfa_aal.sql)
-- to every table added after that migration and to the location-photos bucket.
-- Without this a password-only (aal1) session of a user with a verified MFA
-- factor could still reach these tables / objects through the Data API.
--
-- Service-role-only tables (rate limits, *_attempts) have no authenticated
-- policies, so they are intentionally left out.

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'custom_units',
    'floor_plan_item_placements',
    'floor_plan_storage_location_markers',
    'floor_plans',
    'household_invites',
    'household_members',
    'households',
    'low_stock_notification_states',
    'meal_plans',
    'notification_failures',
    'recipe_items',
    'recipes',
    'shopping_list_archive',
    'waste_streaks'
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
  using (
    bucket_id not in ('item-images', 'location-photos')
    or (select private.mfa_access_allowed())
  )
  with check (
    bucket_id not in ('item-images', 'location-photos')
    or (select private.mfa_access_allowed())
  );
