-- RLS regression tests for shared floor plans and storage-location markers.
begin;

select plan(12);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'user-a+rls-floor-plan@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'user-b+rls-floor-plan@example.com');

insert into storage_locations (id, user_id, name)
values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Kitchen'),
  ('aaaaaaaa-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Bedroom');

insert into items (id, user_id, storage_location_id, name)
values (
  'aaaaaaaa-0000-0000-0000-000000000002',
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Fridge'
);

insert into floor_plans (id, user_id, name, document)
values (
  'aaaaaaaa-0000-0000-0000-000000000003',
  '11111111-1111-1111-1111-111111111111',
  'Home plan',
  '{"schemaVersion":1,"units":"cm","width":600,"height":400,"gridSize":10,"walls":[],"shapes":[]}'::jsonb
);

insert into floor_plan_storage_location_markers (
  id, user_id, floor_plan_id, storage_location_id, x, y
)
values (
  'aaaaaaaa-0000-0000-0000-000000000006',
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000001',
  120,
  80
);

insert into floor_plan_item_placements (id, user_id, floor_plan_id, item_id, x, y)
values (
  'aaaaaaaa-0000-0000-0000-000000000004',
  '11111111-1111-1111-1111-111111111111',
  'aaaaaaaa-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-000000000002',
  140,
  90
);

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is((select count(*) from floor_plans)::int, 1, 'owner can SELECT the shared floor plan');
select is((select count(*) from floor_plan_storage_location_markers)::int, 1, 'owner can SELECT their location marker');
select is((select count(*) from floor_plan_item_placements)::int, 1, 'owner can SELECT their placement');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is((select count(*) from floor_plans)::int, 0, 'other user cannot SELECT the shared floor plan');
select is((select count(*) from floor_plan_storage_location_markers)::int, 0, 'other user cannot SELECT the location marker');
select is((select count(*) from floor_plan_item_placements)::int, 0, 'other user cannot SELECT the placement');

with upd as (
  update floor_plans set name = 'hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000003' returning 1
)
select is((select count(*)::int from upd), 0, 'other user cannot UPDATE the shared floor plan');

select throws_ok(
  $$insert into floor_plan_storage_location_markers (user_id, floor_plan_id, storage_location_id, x, y)
    values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 1, 1)$$,
  '42501',
  'new row violates row-level security policy for table "floor_plan_storage_location_markers"',
  'other user cannot create a marker on another user''s plan or location'
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
  update floor_plan_item_placements set x = 160 where id = 'aaaaaaaa-0000-0000-0000-000000000004' returning 1
)
select is((select count(*)::int from upd), 1, 'owner can UPDATE their placement');

delete from floor_plans where id = 'aaaaaaaa-0000-0000-0000-000000000003';
select is((select count(*) from floor_plan_storage_location_markers)::int, 0, 'deleting a floor plan cascades markers');
select is((select count(*) from floor_plan_item_placements)::int, 0, 'deleting a floor plan cascades placements');

select * from finish();
rollback;
