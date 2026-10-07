-- 世帯メンバー表示名 RPC: set_household_member_display_name (#1182)。
begin;

select plan(9);

insert into auth.users (id, email)
values
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'owner+display-name@example.com'),
  ('c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', 'member+display-name@example.com');

delete from household_members where user_id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2';
insert into household_members (household_id, user_id, role)
values (
  (select household_id from household_members where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'),
  'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2',
  'member'
);

select ok(
  not has_function_privilege('anon', 'public.set_household_member_display_name(text)', 'execute'),
  'anon cannot execute set_household_member_display_name'
);
select ok(
  has_function_privilege('authenticated', 'public.set_household_member_display_name(text)', 'execute'),
  'authenticated can execute set_household_member_display_name'
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2', 'role', 'authenticated')::text, true);

select lives_ok($$select public.set_household_member_display_name('  Hanako  ')$$, 'a member can set their display name');
select is(
  (select display_name from household_members where user_id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2'),
  'Hanako',
  'the display name is trimmed and saved'
);
select is(
  (select display_name from household_members where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'),
  null,
  'other members display names are untouched'
);
select throws_ok(
  $$select public.set_household_member_display_name(repeat('x', 31))$$,
  'HK014', null, 'a display name over 30 characters is rejected'
);
select lives_ok($$select public.set_household_member_display_name('   ')$$, 'a blank name clears the display name');
select is(
  (select display_name from household_members where user_id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2'),
  null,
  'the display name is cleared'
);
select throws_ok(
  $$update household_members set display_name = 'Direct' where user_id = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2'$$,
  '42501', null, 'clients cannot update household_members directly'
);

select * from finish();
rollback;
