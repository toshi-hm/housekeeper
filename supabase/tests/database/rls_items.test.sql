-- RLS regression tests for items, item_lots, and consumption_logs.
--
-- item_lots is the "ownership via join" pattern referenced in issue #463:
-- its policy checks both `user_id = auth.uid()` AND that `item_id` belongs
-- to an item owned by the same user (see
-- supabase/migrations/20260513000001_create_item_lots.sql). We additionally
-- verify that a malicious client cannot forge a lot that is self-owned
-- (user_id = attacker) but points at another user's item.
--
-- Pattern used throughout: two fake auth.users rows are created as the
-- superuser (bypasses RLS), then the session role is switched to
-- `authenticated` with request.jwt.claims.sub set to one user or the other,
-- so that the policies under test are actually enforced (the default
-- `postgres` role owns these tables and would silently bypass RLS).
begin;

select plan(12);

-- Two unrelated users.
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'user-a+rls-items@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'user-b+rls-items@example.com');

-- Seed data owned by user A.
insert into items (id, user_id, name)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Milk');

insert into item_lots (id, user_id, item_id, units)
values ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 2);

insert into consumption_logs (id, user_id, item_id, delta_amount, delta_unit, units_before, units_after)
values ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 1, '個', 2, 1);

-- ===== items =====

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (select count(*) from items)::int,
  1,
  'owner can SELECT their own item'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (select count(*) from items)::int,
  0,
  'other user cannot SELECT another user''s item'
);

with upd as (
    update items set name = 'hacked' where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1
)
select is((select count(*)::int from upd), 0, 'other user cannot UPDATE another user''s item');

with del as (
    delete from items where id = 'aaaaaaaa-0000-0000-0000-000000000001' returning 1
)
select is((select count(*)::int from del), 0, 'other user cannot DELETE another user''s item');

-- ===== item_lots (ownership via join to items) =====

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (select count(*) from item_lots)::int,
  1,
  'owner can SELECT their own item_lots row'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (select count(*) from item_lots)::int,
  0,
  'other user cannot SELECT another user''s item_lots row'
);

with upd as (
    update item_lots set units = 99 where id = 'aaaaaaaa-0000-0000-0000-000000000002' returning 1
)
select is((select count(*)::int from upd), 0, 'other user cannot UPDATE another user''s item_lots row');

with del as (
    delete from item_lots where id = 'aaaaaaaa-0000-0000-0000-000000000002' returning 1
)
select is((select count(*)::int from del), 0, 'other user cannot DELETE another user''s item_lots row');

-- Cross-tenant forgery: user B tries to insert a lot that is self-owned
-- (user_id = B) but references an item that belongs to user A. The policy's
-- WITH CHECK requires the referenced item to belong to auth.uid(), so this
-- must be rejected even though the top-level user_id matches the caller.
select throws_ok(
  $$insert into item_lots (user_id, item_id) values ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001')$$,
  '42501',
  'new row violates row-level security policy for table "item_lots"',
  'other user cannot INSERT a self-owned lot pointing at another user''s item'
);

-- ===== consumption_logs =====

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is(
  (select count(*) from consumption_logs)::int,
  1,
  'owner can SELECT their own consumption_logs row'
);

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (select count(*) from consumption_logs)::int,
  0,
  'other user cannot SELECT another user''s consumption_logs row'
);

with del as (
    delete from consumption_logs where id = 'aaaaaaaa-0000-0000-0000-000000000003' returning 1
)
select is((select count(*)::int from del), 0, 'other user cannot DELETE another user''s consumption_logs row');

select * from finish();

rollback;
