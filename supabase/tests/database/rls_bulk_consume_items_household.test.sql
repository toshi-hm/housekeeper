-- #1178: bulk_consume_items must act on household-shared items, not only on
-- rows created by the caller.
begin;

select plan(5);

insert into auth.users (id, email)
values
  ('a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'creator+bulk-consume@example.com'),
  ('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'member+bulk-consume@example.com');

select set_config('request.jwt.claims', json_build_object('sub', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'role', 'authenticated')::text, true);

insert into items (id, user_id, name, units)
values ('a1a1a1a1-0000-0000-0000-000000000001', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'Rice', 3);

insert into item_lots (id, user_id, item_id, units)
values ('a1a1a1a1-0000-0000-0000-000000000002', 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1', 'a1a1a1a1-0000-0000-0000-000000000001', 3);

insert into household_invites (household_id, code, created_by, expires_at)
values (
  (select household_id from household_members where user_id = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1'),
  'BULKCODE1',
  'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1',
  now() + interval '1 day'
);

select set_config('request.jwt.claims', json_build_object('sub', 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'role', 'authenticated')::text, true);

set local role authenticated;

select ok(
  (select error_code from public.redeem_household_invite('BULKCODE1', true)) is null,
  'member joins the creator household'
);

select lives_ok(
  $$select public.bulk_consume_items(array['a1a1a1a1-0000-0000-0000-000000000001'::uuid])$$,
  'member can bulk consume an item created by another member'
);

select is(
  (select count(*) from item_lots where item_id = 'a1a1a1a1-0000-0000-0000-000000000001')::int,
  0,
  'lots created by another member are removed'
);

select is(
  (select units from items where id = 'a1a1a1a1-0000-0000-0000-000000000001'),
  0,
  'item units are reset to match the lots'
);

select is(
  (select count(*) from consumption_logs where item_id = 'a1a1a1a1-0000-0000-0000-000000000001' and user_id = 'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2')::int,
  1,
  'a consumption log is recorded for the acting member'
);

select * from finish();
rollback;
