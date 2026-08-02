-- Brute-force protection for redeem_household_invite() (#734).
--
-- redeem_household_invite() is called directly by any authenticated client
-- (no Edge Function / service_role in front of it, per docs/specs/features/
-- household-sharing.md §3.1), and invite codes are only guaranteed to be
-- >= 6 chars (household_invites_code_length). Without a limit, a valid
-- session is enough to brute-force another household's short invite code.
--
-- Mirrors check_chat_rate_limit()'s per-authenticated-user derivation (user
-- id comes from auth.uid(), never a client-supplied identifier, since this
-- is always invoked with the caller's own JWT) combined with
-- check_security_reset_rate_limit()'s exponential-backoff lockout (a fixed
-- request-count window alone would still let an attacker grind through a
-- 6-char code over a long enough time; a growing lockout makes that
-- impractical). Constants are hardcoded (not caller-configurable), matching
-- check_chat_rate_limit()'s tightened convention for functions callable
-- directly by any authenticated client.

create table if not exists public.household_invite_attempts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  attempt_count int not null default 0,
  first_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  locked_until timestamptz
);

alter table public.household_invite_attempts enable row level security;
revoke all on table public.household_invite_attempts from public, anon, authenticated;
-- No policies: only ever read/written by check_household_invite_rate_limit()
-- below (SECURITY DEFINER). No direct client access.

create or replace function public.check_household_invite_rate_limit()
returns table (allowed boolean, retry_after_seconds int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_attempts constant int := 5;
  v_window_minutes constant int := 15;
  v_base_lockout_minutes constant numeric := 1;
  v_max_lockout_minutes constant numeric := 60;
  v_user_id uuid := auth.uid();
  v_row public.household_invite_attempts%rowtype;
  v_now timestamptz := now();
  v_lockout_minutes numeric;
begin
  if v_user_id is null then
    -- No authenticated user in context; fail closed rather than allow.
    return query select false, (v_base_lockout_minutes * 60)::int;
    return;
  end if;

  insert into public.household_invite_attempts (user_id, attempt_count, first_attempt_at, last_attempt_at)
    values (v_user_id, 0, v_now, v_now)
    on conflict (user_id) do nothing;

  select * into v_row
    from public.household_invite_attempts
    where user_id = v_user_id
    for update;

  -- Still inside an active lockout window.
  if v_row.locked_until is not null and v_row.locked_until > v_now then
    return query select false, ceil(extract(epoch from (v_row.locked_until - v_now)))::int;
    return;
  end if;

  -- The rolling window has expired: start a fresh count.
  if v_now - v_row.first_attempt_at > (v_window_minutes || ' minutes')::interval then
    update public.household_invite_attempts
      set attempt_count = 1, first_attempt_at = v_now, last_attempt_at = v_now, locked_until = null
      where user_id = v_user_id;
    return query select true, 0;
    return;
  end if;

  -- Still inside the window: would this attempt exceed the max?
  if v_row.attempt_count + 1 > v_max_attempts then
    v_lockout_minutes := least(
      v_max_lockout_minutes,
      v_base_lockout_minutes * power(2, v_row.attempt_count - v_max_attempts)
    );
    update public.household_invite_attempts
      set attempt_count = v_row.attempt_count + 1,
          last_attempt_at = v_now,
          locked_until = v_now + (v_lockout_minutes || ' minutes')::interval
      where user_id = v_user_id;
    return query select false, ceil(v_lockout_minutes * 60)::int;
    return;
  end if;

  update public.household_invite_attempts
    set attempt_count = v_row.attempt_count + 1, last_attempt_at = v_now
    where user_id = v_user_id;
  return query select true, 0;
end;
$$;

revoke all on function public.check_household_invite_rate_limit() from public;
grant execute on function public.check_household_invite_rate_limit() to authenticated;

-- Re-create redeem_household_invite() to enforce the rate limit *and* make
-- the enforcement itself reliable.
--
-- A naive "check_household_invite_rate_limit() then raise exception on
-- invalid code" ordering does not work: an uncaught RAISE EXCEPTION aborts
-- the *entire* transaction backing this single RPC call, which rolls back
-- every write made earlier in the same call — including the rate-limit
-- attempt_count increment that just happened. That means the exact case we
-- need to throttle (repeatedly guessing wrong codes, each ending in a raised
-- HK006) would never actually persist an attempt, and the limiter would be a
-- no-op against brute-forcing. Verified locally: with the previous
-- raise-based version, 6 consecutive calls with wrong codes still let a 7th,
-- correct-code call through, because none of the wrong-code attempts left a
-- durable trace.
--
-- The fix: redeem_household_invite() no longer raises for its "expected"
-- outcomes (already a member / invalid code / rate limited). It returns a
-- single row (household_id, error_code) instead, with error_code null on
-- success — so every call, whatever the outcome, commits normally and the
-- rate-limit bookkeeping is never rolled back. No client code depends on the
-- old throwing contract yet (the household UI itself is not built), so this
-- is a safe point to make that change. Genuinely unexpected DB errors
-- (constraint violations etc.) still propagate as ordinary exceptions.
drop function if exists public.redeem_household_invite(text);

create function public.redeem_household_invite(p_code text)
returns table (household_id uuid, error_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.household_invites%rowtype;
  v_rate_limit record;
begin
  select * into v_rate_limit from public.check_household_invite_rate_limit();
  if not v_rate_limit.allowed then
    return query select null::uuid, 'HK007'::text;
    return;
  end if;

  if exists (
    select 1 from public.household_members where user_id = (select auth.uid())
  ) then
    return query select null::uuid, 'HK005'::text;
    return;
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
    return query select null::uuid, 'HK006'::text;
    return;
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_invite.household_id, (select auth.uid()), 'member');

  update public.household_invites
  set redeemed_by = (select auth.uid()), redeemed_at = now()
  where id = v_invite.id;

  return query select v_invite.household_id, null::text;
end;
$$;

revoke all on function public.redeem_household_invite(text) from public;
grant execute on function public.redeem_household_invite(text) to authenticated;
