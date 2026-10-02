-- Household backfill, membership switching, and shared inventory RLS (#64).
begin;

select plan(20);

insert into auth.users (id, email)
values
  ('81818181-8181-8181-8181-818181818181', 'member+household-shared@example.com'),
  ('91919191-9191-9191-9191-919191919191', 'owner+household-shared@example.com');

-- B owns an item and invite. A has an item in their automatically created
-- personal household. A's item must remain in that household on joining.
select set_config('request.jwt.claims', json_build_object('sub', '91919191-9191-9191-9191-919191919191', 'role', 'authenticated')::text, true);

insert into items (id, user_id, name)
values ('91919191-0000-0000-0000-000000000001', '91919191-9191-9191-9191-919191919191', 'Shared item');

insert into item_lots (id, user_id, item_id, units)
values ('91919191-0000-0000-0000-000000000002', '91919191-9191-9191-9191-919191919191', '91919191-0000-0000-0000-000000000001', 3);

insert into categories (id, user_id, name)
values ('91919191-0000-0000-0000-000000000003', '91919191-9191-9191-9191-919191919191', 'Shared category');

insert into storage_locations (id, user_id, name)
values ('91919191-0000-0000-0000-000000000004', '91919191-9191-9191-9191-919191919191', 'Shared shelf');

insert into custom_units (id, user_id, name)
values ('91919191-0000-0000-0000-000000000005', '91919191-9191-9191-9191-919191919191', 'cup');

insert into consumption_logs (id, user_id, item_id, delta_amount, delta_unit, units_before, units_after)
values ('91919191-0000-0000-0000-000000000006', '91919191-9191-9191-9191-919191919191', '91919191-0000-0000-0000-000000000001', 1, '個', 3, 2);

insert into item_tags (id, user_id, name)
values ('91919191-0000-0000-0000-000000000007', '91919191-9191-9191-9191-919191919191', 'shared tag');

insert into items_to_tags (item_id, tag_id, user_id)
values ('91919191-0000-0000-0000-000000000001', '91919191-0000-0000-0000-000000000007', '91919191-9191-9191-9191-919191919191');

insert into household_invites (household_id, code, created_by, expires_at)
values (
  (select household_id from household_members where user_id = '91919191-9191-9191-9191-919191919191'),
  'SHARECODE1',
  '91919191-9191-9191-9191-919191919191',
  now() + interval '1 day'
);

select set_config('request.jwt.claims', json_build_object('sub', '81818181-8181-8181-8181-818181818181', 'role', 'authenticated')::text, true);

insert into items (id, user_id, name)
values ('81818181-0000-0000-0000-000000000001', '81818181-8181-8181-8181-818181818181', 'Personal item');

insert into item_lots (id, user_id, item_id, units)
values ('81818181-0000-0000-0000-000000000002', '81818181-8181-8181-8181-818181818181', '81818181-0000-0000-0000-000000000001', 2);

insert into categories (id, user_id, name)
values ('81818181-0000-0000-0000-000000000003', '81818181-8181-8181-8181-818181818181', 'Personal category');

set local role authenticated;

select is((select count(*) from items)::int, 1, 'member sees only personal item before joining');
select results_eq(
  $$select household_id, error_code from public.redeem_household_invite('SHARECODE1')$$,
  $$select null::uuid, 'HK008'::text$$,
  'membership change is refused until personal-data visibility is explicitly confirmed'
);
select is((select count(*) from items)::int, 1, 'refused membership change leaves old data visible');
select ok(
  (select error_code from public.redeem_household_invite('SHARECODE1', true)) is null,
  'confirmed invite atomically changes membership'
);
select is(
  (select count(*) from items)::int,
  1,
  'new member sees the invited household item and not the former personal item'
);
select is(
  (select count(*) from item_lots where item_id = '81818181-0000-0000-0000-000000000001')::int,
  0,
  'former personal lots are not exposed after joining another household'
);
select is(
  (select count(*) from categories where id = '81818181-0000-0000-0000-000000000003')::int,
  0,
  'former personal master data are not exposed after joining another household'
);
select is((select count(*) from item_lots)::int, 1, 'member can read lots for shared household inventory');
select is((select count(*) from categories)::int, 1, 'member can read categories from the shared household');
select is((select count(*) from storage_locations)::int, 1, 'member can read storage locations from the shared household');
select is((select count(*) from custom_units)::int, 1, 'member can read custom units from the shared household');
select is((select count(*) from consumption_logs)::int, 1, 'member can read consumption history from the shared household');
select is((select count(*) from item_tags)::int, 1, 'member can read item tags from the shared household');
select is((select count(*) from items_to_tags)::int, 1, 'member can read valid item-tag relations from the shared household');

insert into items (id, user_id, name)
values ('81818181-0000-0000-0000-000000000004', '81818181-8181-8181-8181-818181818181', 'New shared item');

select is(
  (select household_id from items where id = '81818181-0000-0000-0000-000000000004'),
  (select household_id from household_members where user_id = '81818181-8181-8181-8181-818181818181'),
  'database trigger assigns new rows to the caller current household'
);
select throws_ok(
  $$insert into items (id, user_id, household_id, name) values ('81818181-0000-0000-0000-000000000005', '81818181-8181-8181-8181-818181818181', '81818181-8181-8181-8181-818181818181', 'Forged item')$$,
  '42501',
  'row household does not match current membership',
  'caller cannot forge the former household id'
);
select throws_ok(
  $$insert into item_lots (user_id, item_id, units) values ('81818181-8181-8181-8181-818181818181', '81818181-0000-0000-0000-000000000001', 1)$$,
  '42501',
  'new row violates row-level security policy for table "item_lots"',
  'shared member cannot attach a new lot to an item in the former household'
);
select throws_ok(
  $$insert into items_to_tags (item_id, tag_id, user_id) values ('81818181-0000-0000-0000-000000000001', '91919191-0000-0000-0000-000000000007', '81818181-8181-8181-8181-818181818181')$$,
  '42501',
  'new row violates row-level security policy for table "items_to_tags"',
  'shared member cannot link an item from another household to a shared tag'
);

reset role;

select is(
  (select count(*) from items where id = '81818181-0000-0000-0000-000000000001')::int,
  1,
  'membership switching preserves the former personal item in the database'
);
select is(
  (select count(*) from items where id = '81818181-0000-0000-0000-000000000004')::int,
  1,
  'new shared item is persisted'
);

select * from finish();
rollback;
