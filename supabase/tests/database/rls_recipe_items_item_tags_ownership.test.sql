-- RLS regression tests for recipe_items / items_to_tags item_id ownership (#804).
--
-- Both tables previously verified only the parent record's ownership
-- (recipes.user_id / items_to_tags.user_id) but never that the referenced
-- item_id actually belongs to the same user. A malicious client could
-- reference another user's item_id in a self-owned parent row. This test
-- verifies the ownership-via-join fix added in
-- supabase/migrations/20260810000001_recipe_items_items_to_tags_item_ownership.sql.
--
-- Pattern matches rls_items.test.sql: fake auth.users rows seeded as
-- superuser, then session role switched to `authenticated` with
-- request.jwt.claims.sub set to the acting user.
begin;

select plan(6);

-- Two unrelated users.
insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'user-a+rls-recipe-tags@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'user-b+rls-recipe-tags@example.com');

-- User A owns an item and a recipe; user B owns a recipe and a tag of their own.
insert into items (id, user_id, name)
values ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Milk');

insert into recipes (id, user_id, name)
values ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Morning Coffee');

insert into recipes (id, user_id, name)
values ('bbbbbbbb-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'B''s Recipe');

insert into item_tags (id, user_id, name)
values ('bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'B''s Tag');

-- ===== recipe_items: cross-tenant forgery =====
-- User B tries to attach a recipe_item to their OWN recipe (passes the
-- parent-ownership check) but pointing at user A's item_id. The fixed
-- WITH CHECK requires the referenced item to belong to auth.uid() too.
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$insert into recipe_items (recipe_id, item_id, amount) values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 1)$$,
  '42501',
  'new row violates row-level security policy for table "recipe_items"',
  'other user cannot INSERT a recipe_item on their own recipe pointing at another user''s item'
);

-- Sanity check: the legitimate owner can still attach their own item to their own recipe.
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select lives_ok(
  $$insert into recipe_items (recipe_id, item_id, amount) values ('aaaaaaaa-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000001', 1)$$,
  'owner can INSERT a recipe_item referencing their own item'
);

select is(
  (select count(*) from recipe_items where recipe_id = 'aaaaaaaa-0000-0000-0000-000000000002')::int,
  1,
  'owner can SELECT the recipe_item they just inserted'
);

-- ===== items_to_tags: cross-tenant forgery =====
-- User B tries to insert a self-owned items_to_tags row (user_id = B, tag_id
-- owned by B) but pointing at user A's item_id.
select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select throws_ok(
  $$insert into items_to_tags (item_id, tag_id, user_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222')$$,
  '42501',
  'new row violates row-level security policy for table "items_to_tags"',
  'other user cannot INSERT an items_to_tags row pointing at another user''s item'
);

-- Sanity check: the legitimate owner can still tag their own item.
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

insert into item_tags (id, user_id, name)
values ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'A''s Tag');

select lives_ok(
  $$insert into items_to_tags (item_id, tag_id, user_id) values ('aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111')$$,
  'owner can INSERT an items_to_tags row referencing their own item'
);

select is(
  (select count(*) from items_to_tags where item_id = 'aaaaaaaa-0000-0000-0000-000000000001')::int,
  1,
  'owner can SELECT the items_to_tags row they just inserted'
);

select * from finish();

rollback;
