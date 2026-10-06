-- #1179: delete_*_if_unused / import_items_batch / auto_archive_expired_items /
-- undo_auto_archive must act on household-shared rows, not only on rows
-- created by the caller.
begin;

select plan(9);

insert into auth.users (id, email)
values
  ('c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'creator+scoped-rpc@example.com'),
  ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 'member+scoped-rpc@example.com');

select set_config('request.jwt.claims', json_build_object('sub', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'role', 'authenticated')::text, true);

insert into categories (id, user_id, name)
values ('c1c1c1c1-0000-0000-0000-000000000001', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'Shared category');

insert into storage_locations (id, user_id, name)
values ('c1c1c1c1-0000-0000-0000-000000000002', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'Shared location');

insert into items (id, user_id, name, barcode, units, expiry_date)
values
  ('c1c1c1c1-0000-0000-0000-000000000003', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'Barcode item', '4900000000001', 1, null),
  ('c1c1c1c1-0000-0000-0000-000000000004', 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1', 'Expired item', null, 1, current_date - 30);

insert into household_invites (household_id, code, created_by, expires_at)
values (
  (select household_id from household_members where user_id = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1'),
  'SCOPECODE1',
  'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1',
  now() + interval '1 day'
);

select set_config('request.jwt.claims', json_build_object('sub', 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 'role', 'authenticated')::text, true);

set local role authenticated;

select ok(
  (select error_code from public.redeem_household_invite('SCOPECODE1', true)) is null,
  'member joins the creator household'
);

select lives_ok(
  $$select public.delete_category_if_unused('c1c1c1c1-0000-0000-0000-000000000001')$$,
  'member can delete a category created by another member'
);

select is(
  (select count(*) from categories where id = 'c1c1c1c1-0000-0000-0000-000000000001')::int,
  0,
  'the category created by another member is actually deleted'
);

select lives_ok(
  $$select public.delete_storage_location_if_unused('c1c1c1c1-0000-0000-0000-000000000002')$$,
  'member can delete a storage location created by another member'
);

select is(
  (select count(*) from storage_locations where id = 'c1c1c1c1-0000-0000-0000-000000000002')::int,
  0,
  'the storage location created by another member is actually deleted'
);

select is(
  (select action from public.import_items_batch(
    '[{"name":"Barcode item","barcode":"4900000000001","lots":[]}]'::jsonb,
    'skip'
  )),
  'skipped',
  'import detects a barcode duplicate of an item created by another member'
);

insert into user_settings (user_id, auto_archive_after_days)
values ('d2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2', 7)
on conflict (user_id) do update set auto_archive_after_days = 7;

select is(
  (select count(*) from public.auto_archive_expired_items() where id = 'c1c1c1c1-0000-0000-0000-000000000004')::int,
  1,
  'auto archive covers expired items created by another member'
);

select is(
  (select deleted_at is not null from items where id = 'c1c1c1c1-0000-0000-0000-000000000004'),
  true,
  'the other member item is soft-deleted'
);

select is(
  public.undo_auto_archive(
    array['c1c1c1c1-0000-0000-0000-000000000004'::uuid],
    (select deleted_at from items where id = 'c1c1c1c1-0000-0000-0000-000000000004')
  ),
  1,
  'undo restores items archived under another member'
);

select * from finish();
rollback;
