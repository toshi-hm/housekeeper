-- Household-prefixed Storage access and the legacy-object transition window.
begin;

select plan(29);

insert into auth.users (id, email)
values
  ('a6400000-0000-0000-0000-000000000001', 'storage-owner@example.com'),
  ('a6400000-0000-0000-0000-000000000002', 'storage-member@example.com'),
  ('a6400000-0000-0000-0000-000000000003', 'storage-outsider@example.com');

update public.household_members member
set household_id = owner_member.household_id
from public.household_members owner_member
where member.user_id = 'a6400000-0000-0000-0000-000000000002'
  and owner_member.user_id = 'a6400000-0000-0000-0000-000000000001';

insert into public.items (id, user_id, name, image_path)
values (
  'a6400000-0000-0000-0000-000000000011',
  'a6400000-0000-0000-0000-000000000001',
  'Legacy image item',
  'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000011.jpg'
);

insert into public.storage_locations (id, user_id, name, photo_path)
values (
  'a6400000-0000-0000-0000-000000000012',
  'a6400000-0000-0000-0000-000000000001',
  'Legacy photo location',
  'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000012.jpg'
);

insert into storage.buckets (id, name, public)
values
  ('item-images', 'item-images', false),
  ('location-photos', 'location-photos', false)
on conflict (id) do update set public = false;

insert into storage.objects (bucket_id, name, owner_id)
values
  (
    'item-images',
    (select household_id::text from public.household_members where user_id = 'a6400000-0000-0000-0000-000000000001')
      || '/a6400000-0000-0000-0000-000000000011.jpg',
    'a6400000-0000-0000-0000-000000000001'
  ),
  (
    'item-images',
    'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000011.jpg',
    'a6400000-0000-0000-0000-000000000001'
  ),
  (
    'item-images',
    'a6400000-0000-0000-0000-000000000001/orphan.jpg',
    'a6400000-0000-0000-0000-000000000001'
  ),
  (
    'item-images',
    'a6400000-0000-0000-0000-000000000003/a6400000-0000-0000-0000-000000000011.jpg',
    'a6400000-0000-0000-0000-000000000003'
  ),
  (
    'location-photos',
    'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000012.jpg',
    'a6400000-0000-0000-0000-000000000001'
  ),
  (
    'location-photos',
    'a6400000-0000-0000-0000-000000000003/a6400000-0000-0000-0000-000000000012.jpg',
    'a6400000-0000-0000-0000-000000000003'
  );

select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a6400000-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
  true
);
set local role authenticated;

select is(
  (select count(*)::int from storage.objects where bucket_id = 'item-images' and name like (select household_id::text || '/%' from public.household_members where user_id = auth.uid())),
  1,
  'household member can read household-prefixed item images'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'item-images' and name = 'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000011.jpg'),
  1,
  'household member can read a referenced legacy item image during migration'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'location-photos' and name = 'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000012.jpg'),
  1,
  'household member can read a referenced legacy location photo during migration'
);
select throws_ok(
  $$update public.items set image_path = 'a6400000-0000-0000-0000-000000000003/a6400000-0000-0000-0000-000000000011.jpg' where id = 'a6400000-0000-0000-0000-000000000011'$$,
  '23514',
  null,
  'household member cannot point an item image at another creator prefix'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'item-images' and name = 'a6400000-0000-0000-0000-000000000003/a6400000-0000-0000-0000-000000000011.jpg'),
  0,
  'forged legacy path cannot expose another creator object'
);
select throws_ok(
  $$update public.storage_locations set photo_path = 'a6400000-0000-0000-0000-000000000003/a6400000-0000-0000-0000-000000000012.jpg' where id = 'a6400000-0000-0000-0000-000000000012'$$,
  '23514',
  null,
  'household member cannot point a location photo at another creator prefix'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'location-photos' and name = 'a6400000-0000-0000-0000-000000000003/a6400000-0000-0000-0000-000000000012.jpg'),
  0,
  'forged legacy location path cannot expose another creator object'
);
select throws_ok(
  $$select count(*) from private.household_legacy_storage_objects$$,
  '42501',
  null,
  'authenticated user cannot read the private legacy ownership mapping'
);
select throws_ok(
  $$insert into private.household_legacy_storage_objects (bucket_id, object_name, creator_user_id, household_id, entity_id) values ('item-images', 'forged/item.jpg', auth.uid(), 'a6400000-0000-0000-0000-000000000001', 'a6400000-0000-0000-0000-000000000011')$$,
  '42501',
  null,
  'authenticated user cannot forge a legacy ownership mapping'
);
select lives_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('item-images', (select household_id::text from public.household_members where user_id = auth.uid()) || '/new-image.jpg', auth.uid()::text)$$,
  'household member can upload under the current household prefix'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('item-images', 'a6400000-0000-0000-0000-000000000003/forged.jpg', auth.uid()::text)$$,
  '42501',
  null,
  'household member cannot upload under another user prefix'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('location-photos', 'a6400000-0000-0000-0000-000000000003/forged.jpg', auth.uid()::text)$$,
  '42501',
  null,
  'household member cannot upload location photos under another user prefix'
);
select throws_ok(
  $$insert into storage.objects (bucket_id, name, owner_id) values ('item-images', (select household_id::text from public.household_members where user_id = 'a6400000-0000-0000-0000-000000000003') || '/forged.jpg', auth.uid()::text)$$,
  '42501',
  null,
  'household member cannot spoof another household prefix'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'item-images' and name = 'a6400000-0000-0000-0000-000000000001/orphan.jpg'),
  0,
  'household member cannot read an unreferenced legacy object from another member'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'item-images' and name = 'a6400000-0000-0000-0000-000000000003/not-owned.jpg'),
  0,
  'household member cannot read an unrelated legacy object'
);
select lives_ok(
  $$update public.storage_locations set photo_path = null where id = 'a6400000-0000-0000-0000-000000000012'$$,
  'household member can clear a valid legacy photo reference'
);
select is(
  private.household_legacy_storage_object_access(
    'location-photos',
    'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000012.jpg',
    false
  ),
  true,
  'household member remains authorized to clean up its former legacy photo after clearing the database reference'
);
reset role;
select is(
  (select count(*)::int from private.household_legacy_storage_objects where bucket_id = 'location-photos' and object_name = 'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000012.jpg'),
  1,
  'cleanup authorization mapping remains until legacy photo removal succeeds'
);
select set_config('storage.allow_delete_query', 'true', true);
select lives_ok(
  $$delete from storage.objects where bucket_id = 'location-photos' and name = 'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000012.jpg'$$,
  'Storage service can remove the authorized former legacy photo'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'location-photos' and name = 'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000012.jpg'),
  0,
  'legacy photo object is deleted'
);
select is(
  (select count(*)::int from private.household_legacy_storage_objects where bucket_id = 'location-photos' and object_name = 'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000012.jpg'),
  0,
  'legacy photo cleanup mapping is removed after Storage deletion succeeds'
);
set local role authenticated;
select lives_ok(
  $$delete from public.items where id = 'a6400000-0000-0000-0000-000000000011'$$,
  'household member can permanently delete an item with a legacy image'
);
select is(
  private.household_legacy_storage_object_access(
    'item-images',
    'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000011.jpg',
    false
  ),
  true,
  'legacy image cleanup remains authorized after its item row is deleted'
);
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a6400000-0000-0000-0000-000000000003', 'role', 'authenticated')::text,
  true
);
set local role authenticated;
select is(
  private.household_legacy_storage_object_access(
    'item-images',
    'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000011.jpg',
    false
  ),
  false,
  'unrelated household cannot use a retained cleanup mapping'
);
reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a6400000-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
  true
);
select is(
  (select count(*)::int from private.household_legacy_storage_objects where bucket_id = 'item-images' and object_name = 'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000011.jpg'),
  1,
  'cleanup authorization mapping remains until legacy image removal succeeds'
);
select lives_ok(
  $$delete from storage.objects where bucket_id = 'item-images' and name = 'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000011.jpg'$$,
  'Storage service can remove the authorized legacy image after its item row is deleted'
);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'item-images' and name = 'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000011.jpg'),
  0,
  'legacy image object is deleted'
);
select is(
  (select count(*)::int from private.household_legacy_storage_objects where bucket_id = 'item-images' and object_name = 'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000011.jpg'),
  0,
  'legacy image cleanup mapping is removed after Storage deletion succeeds'
);
set local role authenticated;

reset role;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'a6400000-0000-0000-0000-000000000003', 'role', 'authenticated')::text,
  true
);
set local role authenticated;
select is(
  (select count(*)::int from storage.objects where bucket_id = 'item-images' and name = 'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000011.jpg'),
  0,
  'unrelated household cannot read a legacy object referenced by another household'
);

select * from finish();
rollback;
