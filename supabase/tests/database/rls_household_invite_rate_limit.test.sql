-- Regression tests for check_household_invite_rate_limit() / the rate limit
-- enforced inside redeem_household_invite() (#734).
--
-- redeem_household_invite() returns (household_id, error_code) rather than
-- throwing (see 20260802000001_household_invite_rate_limit.sql for why:
-- throwing would roll back the rate-limit bookkeeping done earlier in the
-- same call), so outcomes are asserted via results_eq.
--
-- Two users:
--   attacker - never joins anything; hammers redeem_household_invite() with
--              wrong codes to trip the per-user lockout
--   bystander - a completely separate user, used to prove the lockout is
--               scoped per-user (auth.uid()), not global
begin;

select plan(7);

insert into auth.users (id, email)
values
  ('55555555-5555-5555-5555-555555555555', 'attacker+ratelimit@example.com'),
  ('66666666-6666-6666-6666-666666666666', 'owner+ratelimit@example.com'),
  ('77777777-7777-7777-7777-777777777777', 'bystander+ratelimit@example.com');

set local role authenticated;

-- Owner creates a household and issues one valid invite code.
select set_config('request.jwt.claims', json_build_object('sub', '66666666-6666-6666-6666-666666666666', 'role', 'authenticated')::text, true);
select public.create_household('Rate Limit Test Household');

insert into household_invites (household_id, code, created_by, expires_at)
values (
  (select id from households where created_by = '66666666-6666-6666-6666-666666666666'),
  'RATELIMITOK',
  '66666666-6666-6666-6666-666666666666',
  now() + interval '1 day'
);

-- ===== attacker: 5 attempts with wrong codes still count against the limit =====

select set_config('request.jwt.claims', json_build_object('sub', '55555555-5555-5555-5555-555555555555', 'role', 'authenticated')::text, true);

select results_eq($$select household_id, error_code from public.redeem_household_invite('WRONGCODE1')$$, $$select null::uuid, 'HK006'::text$$, 'attacker attempt 1/5: invalid code still allowed through (not yet locked out)');
select results_eq($$select household_id, error_code from public.redeem_household_invite('WRONGCODE2')$$, $$select null::uuid, 'HK006'::text$$, 'attacker attempt 2/5');
select results_eq($$select household_id, error_code from public.redeem_household_invite('WRONGCODE3')$$, $$select null::uuid, 'HK006'::text$$, 'attacker attempt 3/5');
select results_eq($$select household_id, error_code from public.redeem_household_invite('WRONGCODE4')$$, $$select null::uuid, 'HK006'::text$$, 'attacker attempt 4/5');
select results_eq($$select household_id, error_code from public.redeem_household_invite('WRONGCODE5')$$, $$select null::uuid, 'HK006'::text$$, 'attacker attempt 5/5');

-- The 6th attempt is locked out even with the *correct* code: the limiter
-- must guard the RPC itself, not just repeated failures. This is the
-- assertion that catches the rollback bug described above: without a fix,
-- none of the 5 prior "invalid code" attempts would have persisted, and this
-- 6th call would incorrectly succeed instead of coming back HK007.
select results_eq(
  $$select household_id, error_code from public.redeem_household_invite('RATELIMITOK')$$,
  $$select null::uuid, 'HK007'::text$$,
  'attacker is locked out on the 6th attempt within the window, even with a valid code'
);

-- ===== bystander: a separate user is unaffected by the attacker's lockout =====

select set_config('request.jwt.claims', json_build_object('sub', '77777777-7777-7777-7777-777777777777', 'role', 'authenticated')::text, true);

-- (Checked via ok()/error_code only, not results_eq against households: that
-- would re-query households under RLS, whose visibility for bystander
-- depends on this very call having already run — see rls_household.test.sql
-- for the same footgun caught there.)
select ok(
  (select error_code from public.redeem_household_invite('RATELIMITOK')) is null,
  'a different user is not affected by another user''s lockout and can redeem the valid code'
);

select * from finish();

rollback;
