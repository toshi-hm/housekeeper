-- Owner-only household management RPCs (#64, spec §3.4): rename the household
-- and remove (force-leave) a member. households / household_members have no
-- client write policies by design, so both go through security definer RPCs.
--
-- Error codes (SQLSTATE):
--   HK010  caller is not the owner of their household
--   HK011  household name must be 1-50 characters
--   HK012  the owner cannot be removed (including removing yourself)
--   HK013  the target is not a member of the caller's household

create or replace function public.rename_household(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_household_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select hm.household_id into v_household_id
  from public.household_members hm
  where hm.user_id = v_user_id and hm.role = 'owner';

  if v_household_id is null then
    raise exception 'only the household owner can rename it' using errcode = 'HK010';
  end if;

  if char_length(v_name) < 1 or char_length(v_name) > 50 then
    raise exception 'household name must be 1-50 characters' using errcode = 'HK011';
  end if;

  update public.households set name = v_name where id = v_household_id;
end;
$$;

revoke all on function public.rename_household(text) from public, anon;
grant execute on function public.rename_household(text) to authenticated;

-- The removed member keeps working: they receive a fresh personal household
-- (as at sign-up) so shared-table triggers and RLS still resolve a household.
-- Rows they created stay in the household they left (user_id only records the
-- creator); nothing is deleted or moved.
create or replace function public.remove_household_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_household_id uuid;
  v_target_role public.household_role;
  v_new_household_id uuid;
begin
  if v_actor_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select hm.household_id into v_household_id
  from public.household_members hm
  where hm.user_id = v_actor_id and hm.role = 'owner';

  if v_household_id is null then
    raise exception 'only the household owner can remove members' using errcode = 'HK010';
  end if;

  if p_user_id is null or p_user_id = v_actor_id then
    raise exception 'the household owner cannot be removed' using errcode = 'HK012';
  end if;

  select hm.role into v_target_role
  from public.household_members hm
  where hm.household_id = v_household_id and hm.user_id = p_user_id
  for update;

  if not found then
    raise exception 'user is not a member of this household' using errcode = 'HK013';
  end if;

  if v_target_role = 'owner' then
    raise exception 'the household owner cannot be removed' using errcode = 'HK012';
  end if;

  delete from public.household_members
  where household_id = v_household_id and user_id = p_user_id;

  insert into public.households (name, created_by)
  values ('My household', p_user_id)
  returning id into v_new_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_new_household_id, p_user_id, 'owner');
end;
$$;

revoke all on function public.remove_household_member(uuid) from public, anon;
grant execute on function public.remove_household_member(uuid) to authenticated;
