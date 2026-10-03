-- Household membership bootstrap and the first shared-data slice (#64).
-- Existing user_id values remain as creator/audit metadata. Every existing
-- row is assigned to the household of its current user without changing row
-- ownership or deleting data. Storage objects remain user-scoped in this
-- migration; their path copy/rename is a separate rollout step.

-- ===== personal household bootstrap =====

create or replace function private.create_personal_household_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  if exists (
    select 1 from public.household_members where user_id = new.id
  ) then
    return new;
  end if;

  insert into public.households (name, created_by)
  values ('My household', new.id)
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, new.id, 'owner');

  return new;
end;
$$;

revoke all on function private.create_personal_household_for_user() from public, anon, authenticated;

create trigger on_auth_user_created_household
  after insert on auth.users
  for each row execute function private.create_personal_household_for_user();

-- Backfill accounts created before the trigger. Existing household memberships
-- (if any) are preserved. Names are generic so an email address is never
-- copied into data visible to other household members.
insert into public.households (name, created_by)
select 'My household', u.id
from auth.users u
where not exists (
  select 1 from public.household_members hm where hm.user_id = u.id
);

insert into public.household_members (household_id, user_id, role)
select h.id, h.created_by, 'owner'
from public.households h
where h.name = 'My household'
  and not exists (
    select 1 from public.household_members hm where hm.user_id = h.created_by
  );

-- ===== household_id columns =====

alter table public.items add column household_id uuid references public.households(id) on delete cascade;
alter table public.item_lots add column household_id uuid references public.households(id) on delete cascade;
alter table public.categories add column household_id uuid references public.households(id) on delete cascade;
alter table public.storage_locations add column household_id uuid references public.households(id) on delete cascade;
alter table public.custom_units add column household_id uuid references public.households(id) on delete cascade;
alter table public.consumption_logs add column household_id uuid references public.households(id) on delete cascade;
alter table public.item_tags add column household_id uuid references public.households(id) on delete cascade;
alter table public.items_to_tags add column household_id uuid references public.households(id) on delete cascade;

update public.items i
set household_id = hm.household_id
from public.household_members hm
where hm.user_id = i.user_id;

update public.item_lots l
set household_id = i.household_id
from public.items i
where i.id = l.item_id;

update public.categories c
set household_id = hm.household_id
from public.household_members hm
where hm.user_id = c.user_id;

update public.storage_locations s
set household_id = hm.household_id
from public.household_members hm
where hm.user_id = s.user_id;

update public.custom_units c
set household_id = hm.household_id
from public.household_members hm
where hm.user_id = c.user_id;

update public.consumption_logs l
set household_id = i.household_id
from public.items i
where i.id = l.item_id;

update public.item_tags t
set household_id = hm.household_id
from public.household_members hm
where hm.user_id = t.user_id;

update public.items_to_tags it
set household_id = hm.household_id
from public.household_members hm
where hm.user_id = it.user_id;

alter table public.items alter column household_id set not null;
alter table public.item_lots alter column household_id set not null;
alter table public.categories alter column household_id set not null;
alter table public.storage_locations alter column household_id set not null;
alter table public.custom_units alter column household_id set not null;
alter table public.consumption_logs alter column household_id set not null;
alter table public.item_tags alter column household_id set not null;
alter table public.items_to_tags alter column household_id set not null;

create index items_household_id_idx on public.items(household_id);
create index item_lots_household_id_idx on public.item_lots(household_id);
create index categories_household_id_idx on public.categories(household_id);
create index storage_locations_household_id_idx on public.storage_locations(household_id);
create index custom_units_household_id_idx on public.custom_units(household_id);
create index consumption_logs_household_id_idx on public.consumption_logs(household_id);
create index item_tags_household_id_idx on public.item_tags(household_id);
create index items_to_tags_household_id_idx on public.items_to_tags(household_id);

-- New rows inherit the authenticated user's current household. Explicitly
-- supplied IDs are accepted only when they match membership, preventing a
-- client from creating rows in another household.
create or replace function private.assign_current_household_id()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_household_id uuid;
begin
  -- Authenticated clients cannot spoof the creator. Elevated migration/test
  -- contexts without a JWT derive the personal household from user_id.
  if v_actor_id is null then
    v_actor_id := new.user_id;
  elsif tg_op = 'INSERT' then
    new.user_id := v_actor_id;
  elsif new.user_id is distinct from old.user_id then
    raise exception 'creator cannot be changed' using errcode = '42501';
  end if;

  select hm.household_id into v_household_id
  from public.household_members hm
  where hm.user_id = v_actor_id;

  if v_household_id is null then
    raise exception 'user does not belong to a household' using errcode = '42501';
  end if;

  if new.household_id is null then
    new.household_id := v_household_id;
  elsif new.household_id <> v_household_id then
    raise exception 'row household does not match current membership' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function private.assign_current_household_id() from public, anon;
grant execute on function private.assign_current_household_id() to authenticated;

create trigger items_assign_household before insert or update of household_id, user_id on public.items for each row execute function private.assign_current_household_id();
create trigger item_lots_assign_household before insert or update of household_id, user_id on public.item_lots for each row execute function private.assign_current_household_id();
create trigger categories_assign_household before insert or update of household_id, user_id on public.categories for each row execute function private.assign_current_household_id();
create trigger storage_locations_assign_household before insert or update of household_id, user_id on public.storage_locations for each row execute function private.assign_current_household_id();
create trigger custom_units_assign_household before insert or update of household_id, user_id on public.custom_units for each row execute function private.assign_current_household_id();
create trigger consumption_logs_assign_household before insert or update of household_id, user_id on public.consumption_logs for each row execute function private.assign_current_household_id();
create trigger item_tags_assign_household before insert or update of household_id, user_id on public.item_tags for each row execute function private.assign_current_household_id();
create trigger items_to_tags_assign_household before insert or update of household_id, user_id on public.items_to_tags for each row execute function private.assign_current_household_id();

-- ===== household RLS =====

drop policy "Users can only access their own items" on public.items;
create policy items_household_all on public.items for all to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));

drop policy "item_lots_owner_all" on public.item_lots;
create policy item_lots_household_all on public.item_lots for all to authenticated
  using (
    household_id = (select private.current_household_id())
    and exists (select 1 from public.items i where i.id = item_lots.item_id and i.household_id = item_lots.household_id)
  )
  with check (
    household_id = (select private.current_household_id())
    and exists (select 1 from public.items i where i.id = item_lots.item_id and i.household_id = item_lots.household_id)
  );

drop policy "categories_owner_all" on public.categories;
create policy categories_household_all on public.categories for all to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));

drop policy "storage_locations_owner_all" on public.storage_locations;
create policy storage_locations_household_all on public.storage_locations for all to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));

drop policy "custom_units_owner_all" on public.custom_units;
create policy custom_units_household_all on public.custom_units for all to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));

drop policy "consumption_logs_owner_all" on public.consumption_logs;
create policy consumption_logs_household_all on public.consumption_logs for all to authenticated
  using (
    household_id = (select private.current_household_id())
    and exists (select 1 from public.items i where i.id = consumption_logs.item_id and i.household_id = consumption_logs.household_id)
  )
  with check (
    household_id = (select private.current_household_id())
    and exists (select 1 from public.items i where i.id = consumption_logs.item_id and i.household_id = consumption_logs.household_id)
  );

drop policy "item_tags_owner_all" on public.item_tags;
create policy item_tags_household_all on public.item_tags for all to authenticated
  using (household_id = (select private.current_household_id()))
  with check (household_id = (select private.current_household_id()));

drop policy "items_to_tags_owner_all" on public.items_to_tags;
create policy items_to_tags_household_all on public.items_to_tags for all to authenticated
  using (
    household_id = (select private.current_household_id())
    and exists (select 1 from public.items i where i.id = items_to_tags.item_id and i.household_id = items_to_tags.household_id)
    and exists (select 1 from public.item_tags t where t.id = items_to_tags.tag_id and t.household_id = items_to_tags.household_id)
  )
  with check (
    household_id = (select private.current_household_id())
    and exists (select 1 from public.items i where i.id = items_to_tags.item_id and i.household_id = items_to_tags.household_id)
    and exists (select 1 from public.item_tags t where t.id = items_to_tags.tag_id and t.household_id = items_to_tags.household_id)
  );

-- Keep the brute-force guard's durable, non-raising return contract (#734).
-- A caller with a personal household must explicitly confirm that its existing
-- data remains in that household and is not transferred when joining.
drop function public.redeem_household_invite(text);

create function public.redeem_household_invite(
  p_code text,
  p_confirm_personal_data_inaccessible boolean default false
)
returns table (household_id uuid, error_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.household_invites%rowtype;
  v_rate_limit record;
  v_current_household uuid;
begin
  select * into v_rate_limit from public.check_household_invite_rate_limit();
  if not v_rate_limit.allowed then
    return query select null::uuid, 'HK007'::text;
    return;
  end if;

  v_current_household := private.current_household_id();
  if v_current_household is not null and not coalesce(p_confirm_personal_data_inaccessible, false) then
    return query select null::uuid, 'HK008'::text;
    return;
  end if;

  select * into v_invite
  from public.household_invites
  where code = p_code
  for update;

  if v_invite.id is null or v_invite.redeemed_at is not null or v_invite.expires_at <= now() then
    return query select null::uuid, 'HK006'::text;
    return;
  end if;

  -- Re-joining the household the caller already belongs to would delete and
  -- re-insert the membership, silently downgrading an owner to member.
  if v_invite.household_id = v_current_household then
    return query select null::uuid, 'HK006'::text;
    return;
  end if;

  -- Leaving must never strand a shared household without an owner: block when
  -- the caller is the last owner of a household that still has other members.
  if v_current_household is not null
    and exists (
      select 1 from public.household_members hm
      where hm.household_id = v_current_household
        and hm.user_id = (select auth.uid())
        and hm.role = 'owner'
    )
    and not exists (
      select 1 from public.household_members hm
      where hm.household_id = v_current_household
        and hm.user_id <> (select auth.uid())
        and hm.role = 'owner'
    )
    and exists (
      select 1 from public.household_members hm
      where hm.household_id = v_current_household
        and hm.user_id <> (select auth.uid())
    )
  then
    return query select null::uuid, 'HK009'::text;
    return;
  end if;

  if v_current_household is not null then
    delete from public.household_members
    where public.household_members.user_id = (select auth.uid())
      and public.household_members.household_id = v_current_household;
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_invite.household_id, (select auth.uid()), 'member');

  update public.household_invites
  set redeemed_by = (select auth.uid()), redeemed_at = now()
  where id = v_invite.id;

  return query select v_invite.household_id, null::text;
end;
$$;

revoke all on function public.redeem_household_invite(text, boolean) from public;
grant execute on function public.redeem_household_invite(text, boolean) to authenticated;
