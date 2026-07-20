-- RLS regression tests for shopping_list_items, shopping_list_templates,
-- and shopping_list_template_items.
begin;

select plan(12);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'user-a+rls-shopping@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'user-b+rls-shopping@example.com');

insert into shopping_list_items (id, user_id, name)
values ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Eggs');

insert into shopping_list_templates (id, user_id, name)
values ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Weekly staples');

insert into shopping_list_template_items (id, template_id, user_id, name)
values ('cccccccc-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Bread');

-- ===== shopping_list_items =====

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is((select count(*) from shopping_list_items)::int, 1, 'owner can SELECT their own shopping_list_items row');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is((select count(*) from shopping_list_items)::int, 0, 'other user cannot SELECT another user''s shopping_list_items row');

with upd as (
  update shopping_list_items set name = 'hacked' where id = 'cccccccc-0000-0000-0000-000000000001' returning 1
)
select is((select count(*)::int from upd), 0, 'other user cannot UPDATE another user''s shopping_list_items row');

with del as (
  delete from shopping_list_items where id = 'cccccccc-0000-0000-0000-000000000001' returning 1
)
select is((select count(*)::int from del), 0, 'other user cannot DELETE another user''s shopping_list_items row');

-- ===== shopping_list_templates =====

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is((select count(*) from shopping_list_templates)::int, 1, 'owner can SELECT their own shopping_list_templates row');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is((select count(*) from shopping_list_templates)::int, 0, 'other user cannot SELECT another user''s shopping_list_templates row');

with upd as (
  update shopping_list_templates set name = 'hacked' where id = 'cccccccc-0000-0000-0000-000000000002' returning 1
)
select is((select count(*)::int from upd), 0, 'other user cannot UPDATE another user''s shopping_list_templates row');

with del as (
  delete from shopping_list_templates where id = 'cccccccc-0000-0000-0000-000000000002' returning 1
)
select is((select count(*)::int from del), 0, 'other user cannot DELETE another user''s shopping_list_templates row');

-- ===== shopping_list_template_items =====

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is((select count(*) from shopping_list_template_items)::int, 1, 'owner can SELECT their own shopping_list_template_items row');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is((select count(*) from shopping_list_template_items)::int, 0, 'other user cannot SELECT another user''s shopping_list_template_items row');

with upd as (
  update shopping_list_template_items set name = 'hacked' where id = 'cccccccc-0000-0000-0000-000000000003' returning 1
)
select is((select count(*)::int from upd), 0, 'other user cannot UPDATE another user''s shopping_list_template_items row');

with del as (
  delete from shopping_list_template_items where id = 'cccccccc-0000-0000-0000-000000000003' returning 1
)
select is((select count(*)::int from del), 0, 'other user cannot DELETE another user''s shopping_list_template_items row');

select * from finish();

rollback;
