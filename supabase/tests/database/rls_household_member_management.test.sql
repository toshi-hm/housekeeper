-- Owner-only household management RPCs: rename_household / remove_household_member
-- (#64, docs/specs/features/household-sharing.md §3.4).
begin;

select plan(17);

insert into auth.users (id, email)
values
  ('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'owner+household-manage@example.com'),
  ('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'member+household-manage@example.com'),
  ('b3b3b3b3-b3b3-b3b3-b3b3-b3b3b3b3b3b3', 'outsider+household-manage@example.com');

-- Put the member into the owner's household (as the superuser; the redeem
-- flow is covered by other suites). Their auto-created personal household is
-- left behind, exactly as after redeem_household_invite.
delete from household_members where user_id = 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2';
insert into household_members (household_id, user_id, role)
values (
  (select household_id from household_members where user_id = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1'),
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  'member'
);

select ok(
  not has_function_privilege('anon', 'public.rename_household(text)', 'execute'),
  'anon cannot execute rename_household'
);
select ok(
  not has_function_privilege('anon', 'public.remove_household_member(uuid)', 'execute'),
  'anon cannot execute remove_household_member'
);
select ok(
  has_function_privilege('authenticated', 'public.rename_household(text)', 'execute')
    and has_function_privilege('authenticated', 'public.remove_household_member(uuid)', 'execute'),
  'authenticated can execute both RPCs'
);

set local role authenticated;

-- ===== member: no management rights =====

select set_config('request.jwt.claims', json_build_object('sub', 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'role', 'authenticated')::text, true);

select throws_ok($$select public.rename_household('Hijacked')$$, 'HK010', null, 'a member cannot rename the household');
select throws_ok(
  $$select public.remove_household_member('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1')$$,
  'HK010', null, 'a member cannot remove anyone'
);

-- ===== owner: rename =====

select set_config('request.jwt.claims', json_build_object('sub', 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'role', 'authenticated')::text, true);

select lives_ok($$select public.rename_household('  Our Home  ')$$, 'the owner can rename the household');
select is((select name from households), 'Our Home', 'the name is trimmed and saved');
select throws_ok($$select public.rename_household('   ')$$, 'HK011', null, 'a blank name is rejected');
select throws_ok($$select public.rename_household(repeat('x', 51))$$, 'HK011', null, 'a name over 50 characters is rejected');

-- ===== owner: remove =====

select throws_ok(
  $$select public.remove_household_member('b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1')$$,
  'HK012', null, 'the owner cannot remove themselves'
);
select throws_ok(
  $$select public.remove_household_member('b3b3b3b3-b3b3-b3b3-b3b3-b3b3b3b3b3b3')$$,
  'HK013', null, 'a user outside the household cannot be removed'
);
select throws_ok(
  $$select public.remove_household_member(null)$$,
  'HK012', null, 'a null target is rejected'
);

-- A row created by the member before removal stays in the household.
select set_config('request.jwt.claims', json_build_object('sub', 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'role', 'authenticated')::text, true);
insert into categories (id, user_id, name)
values ('b2b2b2b2-0000-0000-0000-000000000001', 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'Member category');

select set_config('request.jwt.claims', json_build_object('sub', 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1', 'role', 'authenticated')::text, true);
select lives_ok(
  $$select public.remove_household_member('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2')$$,
  'the owner can remove a member'
);
select is(
  (select count(*) from household_members where household_id = private.current_household_id())::int,
  1, 'the household has only the owner left'
);
select is(
  (select count(*) from categories where id = 'b2b2b2b2-0000-0000-0000-000000000001')::int,
  1, 'data the removed member created stays in the household'
);

-- The removed member still has a working (new, personal) household.
select set_config('request.jwt.claims', json_build_object('sub', 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'role', 'authenticated')::text, true);
select is(
  (select role::text from household_members where user_id = 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2'),
  'owner', 'the removed member owns a new personal household'
);
select is(
  (select count(*) from categories where id = 'b2b2b2b2-0000-0000-0000-000000000001')::int,
  0, 'the removed member can no longer see the old household data'
);

reset role;

select * from finish();
rollback;
