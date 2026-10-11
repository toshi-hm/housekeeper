-- #1209: the restrictive mfa_aal_required policy must cover every public table
-- that authenticated users can reach, plus both private Storage buckets, so a
-- table/bucket added later cannot silently skip the aal2 requirement.
begin;

select plan(7);

-- Structural guard: any public table with RLS and at least one policy for
-- authenticated clients must carry mfa_aal_required. Service-role-only tables
-- (RLS enabled, no policies) are excluded by the "has a policy" condition.
select is(
  (
    select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity
      and exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
      )
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public'
          and p.tablename = c.relname
          and p.policyname = 'mfa_aal_required'
          and p.permissive = 'RESTRICTIVE'
      )
  ),
  '',
  'every public table with policies has the restrictive mfa_aal_required policy'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'mfa_aal_required'
      and qual like '%location-photos%'
      and with_check like '%location-photos%'
  ),
  'storage mfa_aal_required policy covers the location-photos bucket'
);

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'mfa_aal_required'
      and qual like '%item-images%'
  ),
  'storage mfa_aal_required policy still covers the item-images bucket'
);

-- Behavioural check on tables that previously skipped the policy.
insert into auth.users (id, email)
values ('a9000000-0000-0000-0000-000000000001', 'mfa-aal@example.com');

insert into public.recipes (id, user_id, name)
values (
  'a9000000-0000-0000-0000-000000000011',
  'a9000000-0000-0000-0000-000000000001',
  'MFA recipe'
);

insert into public.custom_units (id, user_id, name)
values (
  'a9000000-0000-0000-0000-000000000012',
  'a9000000-0000-0000-0000-000000000001',
  'MFA unit'
);

insert into auth.mfa_factors (id, user_id, factor_type, status, created_at, updated_at)
values (
  'a9000000-0000-0000-0000-000000000021',
  'a9000000-0000-0000-0000-000000000001',
  'totp',
  'verified',
  now(),
  now()
);

set local role authenticated;

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a9000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal1')::text,
  true
);
select is((select count(*)::int from public.recipes), 0, 'aal1 session cannot read recipes of an MFA-enabled user');
select is((select count(*)::int from public.custom_units), 0, 'aal1 session cannot read custom_units of an MFA-enabled user');

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a9000000-0000-0000-0000-000000000001', 'role', 'authenticated', 'aal', 'aal2')::text,
  true
);
select is((select count(*)::int from public.recipes), 1, 'aal2 session can read recipes');
select is((select count(*)::int from public.custom_units), 1, 'aal2 session can read custom_units');

select * from finish();
rollback;
