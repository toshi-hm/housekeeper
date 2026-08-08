-- Fix missing ON DELETE CASCADE on households.created_by and
-- household_invites.created_by (#778).
--
-- 20260801020000_create_household_foundation.sql created both columns as a
-- plain `references auth.users(id)` (no ON DELETE clause -> defaults to NO
-- ACTION), unlike every other auth.users(id) reference added in that
-- migration for the "owning user" of a row (household_members.user_id is
-- `on delete cascade`). As a result, deleting the auth.users row of anyone
-- who has ever created a household or issued an invite fails with a foreign
-- key violation instead of cascading away their household/invite rows.
--
-- The original `create table` statements did not name these constraints
-- explicitly, so Postgres auto-generated their names. Rather than assume the
-- default naming convention held, the constraint name is looked up from
-- pg_constraint at migration time and dropped by that name, then re-added
-- with ON DELETE CASCADE (new constraint keeps the same, conventional name).

do $$
declare
  v_constraint_name text;
begin
  select conname
  into v_constraint_name
  from pg_constraint
  where conrelid = 'public.households'::regclass
    and contype = 'f'
    and conkey = (
      select array_agg(attnum order by attnum)
      from pg_attribute
      where attrelid = 'public.households'::regclass
        and attname = 'created_by'
    );

  if v_constraint_name is null then
    raise exception 'could not find FK constraint on households.created_by';
  end if;

  execute format('alter table public.households drop constraint %I', v_constraint_name);
end $$;

alter table public.households
  add constraint households_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete cascade;

do $$
declare
  v_constraint_name text;
begin
  select conname
  into v_constraint_name
  from pg_constraint
  where conrelid = 'public.household_invites'::regclass
    and contype = 'f'
    and conkey = (
      select array_agg(attnum order by attnum)
      from pg_attribute
      where attrelid = 'public.household_invites'::regclass
        and attname = 'created_by'
    );

  if v_constraint_name is null then
    raise exception 'could not find FK constraint on household_invites.created_by';
  end if;

  execute format('alter table public.household_invites drop constraint %I', v_constraint_name);
end $$;

alter table public.household_invites
  add constraint household_invites_created_by_fkey
  foreign key (created_by) references auth.users(id) on delete cascade;
