-- RLS regression tests for floor plans and item placements.
begin;

select plan(9);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'user-a+rls-floor-plan@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'user-b+rls-floor-plan@example.com');

insert into storage_locations (id, user_id, name)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Kitchen');

insert into items (id, user_id, storage_location_id, name)
values (
  'aaaaaaaa-0000-0000-0000-000000000002',
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Fridge'
);

insert into floor_plans (id, user_id, storage_location_id, name, document)
values (
  'aaaaaaaa-0000-0000-0000-000000000003',
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Kitchen plan',
  '{"schemaVersion":1,"units":"cm","width":600,"height":400,"gridSize":10,"walls":[],"shapes":[]}'::jsonb
);

insert into floor_plan_item_placements (id, user_id, floor_plan_id, item_id, x, y)
values (
  'aaaaaaaa-0000-0000-0000-000000000004',
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000002',
  120,
  80
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is((select count(*) from floor_plans)::int, 1, 'owner can SELECT their floor plan');
select is((select count(*) from floor_plan_item_placements)::int, 1, 'owner can SELECT their placement');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is((select count(*) from floor_plans)::int, 0, 'other user cannot SELECT another user''s floor plan');
select is((select count(*) from floor_plan_item_placements)::int, 0, 'other user cannot SELECT another user''s placement');

with upd as (
  update floor_plans set name = 'hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000003' returning 1
)
select is((select count(*)::int from upd), 0, 'other user cannot UPDATE another user''s floor plan');

select throws_ok(
  $$insert into floor_plans (user_id, storage_location_id, name, document)
    values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'forged', '{}'::jsonb)$$,
  '42501',
  'new row violates row-level security policy for table "floor_plans"',
  'other user cannot create a floor plan for another user''s location'
);

select throws_ok(
  $$insert into floor_plan_item_placements (user_id, floor_plan_id, item_id, x, y)
    values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000002', 1, 1)$$,
  '42501',
  'new row violates row-level security policy for table "floor_plan_item_placements"',
  'other user cannot create a placement for another user''s plan or item'
);

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

with upd as (
  update floor_plan_item_placements set x = 140 where id = 'aaaaaaaa-0000-0000-0000-000000000004' returning 1
)
select is((select count(*)::int from upd), 1, 'owner can UPDATE their placement');

delete from floor_plans where id = 'aaaaaaaa-0000-0000-0000-000000000003';
select is((select count(*) from floor_plan_item_placements)::int, 0, 'deleting a floor plan cascades placements');

select * from finish();
rollback;
