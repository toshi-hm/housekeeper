-- RLS regression tests for meal_plans (#715).
begin;

select plan(4);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'user-a+rls-meal-plans@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'user-b+rls-meal-plans@example.com');

insert into meal_plans (id, user_id, planned_date, note)
values ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '2026-08-12', 'Eating out');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is((select count(*) from meal_plans)::int, 1, 'owner can SELECT their own meal_plans row');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is((select count(*) from meal_plans)::int, 0, 'other user cannot SELECT another user''s meal_plans row');

with upd as (
  update meal_plans set note = 'hacked' where id = 'dddddddd-0000-0000-0000-000000000001' returning 1
)
select is((select count(*)::int from upd), 0, 'other user cannot UPDATE another user''s meal_plans row');

with del as (
  delete from meal_plans where id = 'dddddddd-0000-0000-0000-000000000001' returning 1
)
select is((select count(*)::int from del), 0, 'other user cannot DELETE another user''s meal_plans row');

select * from finish();

rollback;
