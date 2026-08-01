-- Household sharing (#64 / #159) — step 1 of a multi-PR rollout, see
-- docs/specs/features/household-sharing.md and PLANS.md §10 "v2 — 多人数共有".
--
-- This migration only lays the data-model + invite plumbing groundwork:
--   - households / household_members / household_invites tables
--   - private.current_household_id() helper (per spec §3.1, exact signature)
--   - create_household() / redeem_household_invite() RPCs
--
-- It deliberately does NOT touch any existing table: no household_id column
-- is added anywhere yet, no existing RLS policy changes, no Storage path
-- changes. Existing tables keep their current user_id-scoped RLS untouched
-- until a later PR switches them over (spec §3.2/§4).
--
-- 1 user = 1 household is enforced at the schema level via the unique index
-- on household_members(user_id) (spec's explicit "やらないこと": no multi-
-- household membership in v1).
--
-- Table/type DDL is created first (households -> household_role ->
-- household_members -> household_invites), then the private.
-- current_household_id() helper (which the RLS policies below reference and
-- therefore must already exist as a resolvable function before any CREATE
-- POLICY runs), then policies/grants, then the two RPCs.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ===== households =====

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger households_set_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();

alter table public.households enable row level security;

-- ===== household_members =====

create type household_role as enum ('owner', 'member');

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role household_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Enforces 1 user = 1 household (spec §2 "やらないこと": no simultaneous
-- membership in multiple households).
create unique index household_members_user_unique on public.household_members(user_id);

alter table public.household_members enable row level security;

-- ===== household_invites =====

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  redeemed_by uuid references auth.users(id),
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  -- Defense-in-depth against a member using the raw INSERT policy below to
  -- craft a degenerate invite (RLS is the real security boundary here, not
  -- whatever code a future client hook happens to generate): the spec's own
  -- example is an ~8-char shareable code with a ~24h expiry, so a generous
  -- 6-char floor and 7-day ceiling never constrain legitimate use while
  -- ruling out a single-char code or a years-long standing backdoor invite.
  constraint household_invites_code_length check (char_length(code) >= 6),
  constraint household_invites_expiry_window check (expires_at <= created_at + interval '7 days')
);

create index household_invites_household_id_idx on public.household_invites(household_id);

alter table public.household_invites enable row level security;

-- ===== helper =====

-- Per spec §3.1, exact signature: returns the caller's household_id (or null
-- if they don't belong to one yet). security definer + empty search_path so
-- it can be used unconditionally inside RLS policies (including on the
-- household_members table itself) without recursing through RLS.
create or replace function private.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id from public.household_members where user_id = (select auth.uid());
$$;

revoke all on function private.current_household_id() from public;
grant execute on function private.current_household_id() to authenticated;

-- ===== RLS policies + grants =====

-- Direct writes to households/household_members are intentionally not opened
-- up via policy: rows are only ever created through the create_household() /
-- redeem_household_invite() RPCs below (both security definer, so they
-- bypass RLS entirely), which also enforce the "1 user = 1 household" rule
-- with a clear error before the unique index would otherwise reject it. This
-- keeps the direct write surface on these two tables at zero.
create policy "households_member_select"
  on public.households
  for select
  to authenticated
  using (id = (select private.current_household_id()));

revoke all on table public.households from anon, authenticated;
grant select on table public.households to authenticated;

create policy "household_members_member_select"
  on public.household_members
  for select
  to authenticated
  using (household_id = (select private.current_household_id()));

revoke all on table public.household_members from anon, authenticated;
grant select on table public.household_members to authenticated;

-- Members (owner or member, per spec §3.4 role table: both can issue invite
-- codes) can see and create invites for their own household. Redemption
-- itself (stamping redeemed_by/redeemed_at and inserting the new member) is
-- deliberately NOT opened up as a direct UPDATE policy — a not-yet-a-member
-- caller has no household_id to match against here anyway, so that write can
-- only happen through the redeem_household_invite() RPC below.
create policy "household_invites_member_select"
  on public.household_invites
  for select
  to authenticated
  using (household_id = (select private.current_household_id()));

create policy "household_invites_member_insert"
  on public.household_invites
  for insert
  to authenticated
  with check (
    household_id = (select private.current_household_id())
    and created_by = (select auth.uid())
    -- Redemption must only ever happen via redeem_household_invite() below;
    -- otherwise a member could insert a row that already looks redeemed
    -- (fabricating a fake join record visible to the rest of the household).
    and redeemed_by is null
    and redeemed_at is null
  );

revoke all on table public.household_invites from anon, authenticated;
grant select, insert on table public.household_invites to authenticated;

-- ===== RPCs =====

-- Bootstrapping counterpart to redeem_household_invite: creates the caller's
-- own household and makes them its owner, atomically. Not part of the
-- spec's explicit RPC list, but required foundational plumbing — without it
-- no household could ever be created (households/household_members have no
-- direct INSERT policy, by design; see the comments above).
create or replace function public.create_household(p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
begin
  if exists (
    select 1 from public.household_members where user_id = (select auth.uid())
  ) then
    raise exception 'user already belongs to a household' using errcode = 'HK005';
  end if;

  insert into public.households (name, created_by)
  values (p_name, (select auth.uid()))
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, (select auth.uid()), 'owner');

  return v_household_id;
end;
$$;

revoke all on function public.create_household(text) from public;
grant execute on function public.create_household(text) to authenticated;

-- Redeems an invite code (spec §3.1/§7): validates the code exists, is
-- unexpired and unused, and that the caller doesn't already belong to a
-- household, then atomically adds the caller as a 'member' and stamps the
-- invite as redeemed. `select ... for update` locks the invite row so two
-- concurrent redemptions of the same code cannot both succeed (the second
-- blocks until the first commits, then sees redeemed_at is no longer null).
create or replace function public.redeem_household_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.household_invites%rowtype;
begin
  if exists (
    select 1 from public.household_members where user_id = (select auth.uid())
  ) then
    raise exception 'user already belongs to a household' using errcode = 'HK005';
  end if;

  select *
  into v_invite
  from public.household_invites
  where code = p_code
  for update;

  if v_invite.id is null
    or v_invite.redeemed_at is not null
    or v_invite.expires_at <= now()
  then
    raise exception 'invalid or expired invite code' using errcode = 'HK006';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_invite.household_id, (select auth.uid()), 'member');

  update public.household_invites
  set redeemed_by = (select auth.uid()), redeemed_at = now()
  where id = v_invite.id;

  return v_invite.household_id;
end;
$$;

revoke all on function public.redeem_household_invite(text) from public;
grant execute on function public.redeem_household_invite(text) to authenticated;
