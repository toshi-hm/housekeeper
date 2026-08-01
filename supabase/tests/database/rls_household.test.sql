-- RLS + RPC regression tests for households / household_members /
-- household_invites (#64 / #159 step 1, see
-- docs/specs/features/household-sharing.md §3.1/§9).
--
-- Pattern used throughout this repo's pgTAP suite: fake auth.users rows are
-- created as the superuser (bypasses RLS), then the session role is switched
-- to `authenticated` with request.jwt.claims.sub set to one user or another,
-- so that the policies and security definer RPCs under test are actually
-- exercised as that user (see rls_items.test.sql).
--
-- Four independent users are used:
--   user1 - creates household1 (becomes its owner), issues invite codes
--   user4 - creates a separate household2, used to prove cross-household
--           isolation (a member of household2 must not see household1's rows)
--   user2 - redeems a valid invite code into household1 (becomes a member)
--   user3 - never joins anything; used to exercise the invalid/expired/
--           already-redeemed invite-code failure paths
begin;

select plan(24);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'user1+household@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'user2+household@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'user3+household@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'user4+household@example.com');

set local role authenticated;

-- ===== user1: starts with no household =====

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is((select count(*) from households)::int, 0, 'user with no household cannot SELECT any household row');
select is((select count(*) from household_members)::int, 0, 'user with no household cannot SELECT any household_members row');
select is((select count(*) from household_invites)::int, 0, 'user with no household cannot SELECT any household_invites row');

-- ===== create_household =====

select lives_ok(
  $$select public.create_household('Household One')$$,
  'user1 can create a household when they belong to none yet'
);

select is((select count(*) from households)::int, 1, 'user1 (owner) can now SELECT their own household');
select is(
  (select role::text from household_members where user_id = '11111111-1111-1111-1111-111111111111'),
  'owner',
  'user1 is recorded as owner of the household they created'
);

select throws_ok(
  $$select public.create_household('Household Uno Bis')$$,
  'HK005',
  'user already belongs to a household',
  'user1 cannot create a second household while already belonging to one'
);

-- Seed two invite codes for household1, issued by its owner (exercises the
-- household_invites insert policy: household_id must match the caller's own
-- household and created_by must be the caller).
insert into household_invites (household_id, code, created_by, expires_at)
values (
  (select id from households where created_by = '11111111-1111-1111-1111-111111111111'),
  'VALIDCODE1',
  '11111111-1111-1111-1111-111111111111',
  now() + interval '1 day'
);

insert into household_invites (household_id, code, created_by, expires_at)
values (
  (select id from households where created_by = '11111111-1111-1111-1111-111111111111'),
  'EXPIREDCODE1',
  '11111111-1111-1111-1111-111111111111',
  now() - interval '1 hour'
);

-- A member must not be able to bypass redeem_household_invite() and insert
-- a row that already looks redeemed (fabricating a fake join record).
select throws_ok(
  $$insert into household_invites (household_id, code, created_by, expires_at, redeemed_by, redeemed_at)
    values (
      (select id from households where created_by = '11111111-1111-1111-1111-111111111111'),
      'SPOOFEDCODE1',
      '11111111-1111-1111-1111-111111111111',
      now() + interval '1 day',
      '22222222-2222-2222-2222-222222222222',
      now()
    )$$,
  '42501',
  'new row violates row-level security policy for table "household_invites"',
  'a member cannot insert an invite that already looks redeemed'
);

-- A member must not be able to craft a standing backdoor invite with an
-- absurdly long expiry (spec's own example is a ~24h window).
select throws_ok(
  $$insert into household_invites (household_id, code, created_by, expires_at)
    values (
      (select id from households where created_by = '11111111-1111-1111-1111-111111111111'),
      'FOREVERCODE1',
      '11111111-1111-1111-1111-111111111111',
      now() + interval '100 years'
    )$$,
  '23514',
  'new row for relation "household_invites" violates check constraint "household_invites_expiry_window"',
  'a member cannot insert an invite with an expiry more than 7 days out'
);

-- A member must not be able to craft a degenerately weak (1-char) code.
select throws_ok(
  $$insert into household_invites (household_id, code, created_by, expires_at)
    values (
      (select id from households where created_by = '11111111-1111-1111-1111-111111111111'),
      'a',
      '11111111-1111-1111-1111-111111111111',
      now() + interval '1 day'
    )$$,
  '23514',
  'new row for relation "household_invites" violates check constraint "household_invites_code_length"',
  'a member cannot insert an invite with a degenerately short code'
);

-- ===== user4: separate household, proves cross-household isolation =====

select set_config('request.jwt.claims', json_build_object('sub', '44444444-4444-4444-4444-444444444444', 'role', 'authenticated')::text, true);

select is((select count(*) from households)::int, 0, 'a non-member (no household yet) cannot SELECT household1');
select is((select count(*) from household_invites)::int, 0, 'a non-member (no household yet) cannot SELECT household1''s invites');

select lives_ok(
  $$select public.create_household('Household Two')$$,
  'user4 can create their own, separate household'
);

select is(
  (select count(*) from household_members)::int,
  1,
  'user4 (member of household2) sees only their own household''s membership row, not household1''s'
);

-- A user who already belongs to a household is rejected with a distinct
-- error from "invalid code" (spec §7), even for an otherwise-valid code.
select throws_ok(
  $$select public.redeem_household_invite('VALIDCODE1')$$,
  'HK005',
  'user already belongs to a household',
  'a user who already belongs to a household cannot redeem an invite code'
);

-- ===== user2: redeems a valid invite into household1 =====

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is((select count(*) from household_members)::int, 0, 'user2 (no household yet) sees no household_members rows before redeeming');

select lives_ok(
  $$select public.redeem_household_invite('VALIDCODE1')$$,
  'user2 can redeem a valid, unexpired, unused invite code'
);

select is(
  (select role::text from household_members where user_id = '22222222-2222-2222-2222-222222222222'),
  'member',
  'user2 is recorded as a member (not owner) of household1 after redeeming'
);

select is((select count(*) from households)::int, 1, 'user2 can now SELECT household1 after joining it');

select throws_ok(
  $$select public.redeem_household_invite('EXPIREDCODE1')$$,
  'HK005',
  'user already belongs to a household',
  'user2 cannot redeem a second invite code now that they belong to household1'
);

-- ===== user3: exercises the invalid/expired/already-redeemed paths =====

select set_config('request.jwt.claims', json_build_object('sub', '33333333-3333-3333-3333-333333333333', 'role', 'authenticated')::text, true);

select throws_ok(
  $$select public.redeem_household_invite('VALIDCODE1')$$,
  'HK006',
  'invalid or expired invite code',
  'a second redemption attempt of an already-redeemed code fails (no double-redeem)'
);

select throws_ok(
  $$select public.redeem_household_invite('EXPIREDCODE1')$$,
  'HK006',
  'invalid or expired invite code',
  'redeeming an expired invite code fails'
);

select throws_ok(
  $$select public.redeem_household_invite('NONEXISTENT')$$,
  'HK006',
  'invalid or expired invite code',
  'redeeming a nonexistent invite code fails'
);

select is((select count(*) from household_members)::int, 0, 'user3 never joined a household and still sees no household_members rows');

select * from finish();

rollback;
