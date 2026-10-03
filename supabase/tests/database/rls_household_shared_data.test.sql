-- Shopping list, templates, and recipes share across household memberships (#64).
begin;
select plan(16);

insert into auth.users (id, email) values
  ('a1818181-8181-8181-8181-818181818181', 'shared-data-member@example.com'),
  ('b1919191-9191-9191-9191-919191919191', 'shared-data-owner@example.com');

select set_config('request.jwt.claims', json_build_object('sub', 'b1919191-9191-9191-9191-919191919191', 'role', 'authenticated')::text, true);
insert into items (id, user_id, name) values ('b1919191-0000-0000-0000-000000000001', 'b1919191-9191-9191-9191-919191919191', 'shared item');
insert into shopping_list_items (id, user_id, name, linked_item_id)
values ('b1919191-0000-0000-0000-000000000002', 'b1919191-9191-9191-9191-919191919191', 'shared groceries', 'b1919191-0000-0000-0000-000000000001');
insert into shopping_list_archive (user_id, name) values ('b1919191-9191-9191-9191-919191919191', 'shared archived item');
select public.save_shopping_list_template(null, 'shared template', '[{"name":"shared template item","desired_units":2}]'::jsonb);
select public.save_recipe(null, 'shared recipe', '[{"item_id":"b1919191-0000-0000-0000-000000000001","amount":1}]'::jsonb);
insert into shopping_list_items (user_id, name, status) values ('b1919191-9191-9191-9191-919191919191', 'purchased by owner', 'purchased');
insert into household_invites (household_id, code, created_by, expires_at)
select household_id, 'SHAREDATA1', 'b1919191-9191-9191-9191-919191919191', now() + interval '1 day'
from household_members where user_id = 'b1919191-9191-9191-9191-919191919191';

select set_config('request.jwt.claims', json_build_object('sub', 'a1818181-8181-8181-8181-818181818181', 'role', 'authenticated')::text, true);
insert into items (id, user_id, name) values ('a1818181-0000-0000-0000-000000000001', 'a1818181-8181-8181-8181-818181818181', 'former private item');
insert into shopping_list_items (user_id, name) values ('a1818181-8181-8181-8181-818181818181', 'private shopping row');
select public.save_shopping_list_template(null, 'private template', '[{"name":"private template item","desired_units":1}]'::jsonb);
select public.save_recipe(null, 'private recipe', '[]'::jsonb);

set local role authenticated;
select is((select count(*) from shopping_list_items)::int, 1, 'member starts with only personal shopping rows');
select is((select error_code from public.redeem_household_invite('SHAREDATA1', true)), null, 'member joins after explicit confirmation');
select public.save_shopping_list_template(null, 'shared template', '[]'::jsonb);
select public.save_recipe(null, 'shared recipe', '[]'::jsonb);
select is((select count(*) from shopping_list_items)::int, 2, 'joined member sees shared shopping rows and not previous private rows');
select is((select count(*) from shopping_list_archive)::int, 1, 'joined member sees shared shopping archive');
select is((select count(*) from shopping_list_templates)::int, 2, 'joining preserves same-named templates created by separate users');
select is((select count(*) from shopping_list_template_items)::int, 1, 'joined member sees template contents');
select is((select count(*) from recipes)::int, 2, 'joining preserves same-named recipes created by separate users');
select is((select count(distinct user_id) from recipes where name = 'shared recipe')::int, 2, 'same-named recipes retain their original creators');
select is((select count(*) from recipe_items)::int, 1, 'joined member sees recipe items');

insert into shopping_list_items (user_id, name, linked_item_id)
values ('a1818181-8181-8181-8181-818181818181', 'member shopping row', 'b1919191-0000-0000-0000-000000000001');
select is((select count(*) from shopping_list_items)::int, 3, 'member can add a shopping row linked to a shared item');
select throws_ok(
  $$insert into shopping_list_items (user_id, household_id, name) values ('a1818181-8181-8181-8181-818181818181', 'a1818181-8181-8181-8181-818181818181', 'forged')$$,
  '42501', 'row household does not match current membership', 'member cannot forge a household id'
);
select throws_ok(
  $$insert into shopping_list_archive (user_id, name) values ('b1919191-9191-9191-9191-919191919191', 'forged archive')$$,
  '42501', 'permission denied for table shopping_list_archive', 'member cannot forge an archive creator through direct insert'
);
select throws_ok(
  $$insert into recipe_items (recipe_id, item_id, amount) values ((select id from recipes limit 1), 'a1818181-0000-0000-0000-000000000001', 1)$$,
  '42501', 'item does not belong to current household', 'member cannot link a recipe to an item from the former household'
);

reset role;
select is((select count(*) from shopping_list_items where name = 'private shopping row')::int, 1, 'former personal shopping row is preserved in its original household');
select set_config('request.jwt.claims', json_build_object('sub', 'a1818181-8181-8181-8181-818181818181', 'role', 'authenticated')::text, true);
set local role authenticated;
select results_eq(
  $$select public.archive_purchased_shopping_items()$$,
  $$select 1::integer$$,
  'joined member can archive purchased rows for the shared household'
);
reset role;
select is((select user_id from shopping_list_archive where name = 'purchased by owner'), 'b1919191-9191-9191-9191-919191919191'::uuid, 'archive preserves the purchased row original creator');
select * from finish();
rollback;
