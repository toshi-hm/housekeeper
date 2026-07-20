-- RLS regression tests for categories, storage_locations, item_tags, and
-- the items_to_tags join table.
begin;

select plan(15);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'user-a+rls-master@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'user-b+rls-master@example.com');

insert into categories (id, user_id, name)
values ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Dairy');

insert into storage_locations (id, user_id, name)
values ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Fridge');

insert into item_tags (id, user_id, name)
values ('bbbbbbbb-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'sale');

insert into items (id, user_id, name)
values ('bbbbbbbb-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Yogurt');

insert into items_to_tags (item_id, tag_id, user_id)
values ('bbbbbbbb-0000-0000-0000-000000000004', 'bbbbbbbb-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111');

-- ===== categories =====

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is((select count(*) from categories)::int, 1, 'owner can SELECT their own category');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is((select count(*) from categories)::int, 0, 'other user cannot SELECT another user''s category');

with upd as (
  update categories set name = 'hacked' where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning 1
)
select is((select count(*)::int from upd), 0, 'other user cannot UPDATE another user''s category');

with del as (
  delete from categories where id = 'bbbbbbbb-0000-0000-0000-000000000001' returning 1
)
select is((select count(*)::int from del), 0, 'other user cannot DELETE another user''s category');

-- ===== storage_locations =====

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is((select count(*) from storage_locations)::int, 1, 'owner can SELECT their own storage_location');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is((select count(*) from storage_locations)::int, 0, 'other user cannot SELECT another user''s storage_location');

with upd as (
  update storage_locations set name = 'hacked' where id = 'bbbbbbbb-0000-0000-0000-000000000002' returning 1
)
select is((select count(*)::int from upd), 0, 'other user cannot UPDATE another user''s storage_location');

with del as (
  delete from storage_locations where id = 'bbbbbbbb-0000-0000-0000-000000000002' returning 1
)
select is((select count(*)::int from del), 0, 'other user cannot DELETE another user''s storage_location');

-- ===== item_tags =====

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is((select count(*) from item_tags)::int, 1, 'owner can SELECT their own item_tag');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is((select count(*) from item_tags)::int, 0, 'other user cannot SELECT another user''s item_tag');

with upd as (
  update item_tags set name = 'hacked' where id = 'bbbbbbbb-0000-0000-0000-000000000003' returning 1
)
select is((select count(*)::int from upd), 0, 'other user cannot UPDATE another user''s item_tag');

with del as (
  delete from item_tags where id = 'bbbbbbbb-0000-0000-0000-000000000003' returning 1
)
select is((select count(*)::int from del), 0, 'other user cannot DELETE another user''s item_tag');

-- ===== items_to_tags (join table) =====

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is((select count(*) from items_to_tags)::int, 1, 'owner can SELECT their own items_to_tags row');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is((select count(*) from items_to_tags)::int, 0, 'other user cannot SELECT another user''s items_to_tags row');

with del as (
    delete from items_to_tags
    where item_id = 'bbbbbbbb-0000-0000-0000-000000000004' and tag_id = 'bbbbbbbb-0000-0000-0000-000000000003'
    returning 1
)
select is((select count(*)::int from del), 0, 'other user cannot DELETE another user''s items_to_tags row');

-- NOTE: unlike item_lots, the items_to_tags policy only checks
-- `auth.uid() = user_id` on INSERT/UPDATE — it does NOT verify that
-- item_id/tag_id actually belong to the caller (no EXISTS join-check like
-- item_lots has). So a user can currently insert a row that is self-owned
-- but references another user's item_id/tag_id. This does not leak the
-- other user's item/tag *content* (items and item_tags RLS still hide
-- those), but it is a data-integrity gap worth hardening in a follow-up —
-- intentionally not asserted/fixed here since it's outside the scope of
-- issue #463.

select * from finish();

rollback;
