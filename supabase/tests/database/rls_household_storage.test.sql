-- Household-prefixed Storage access and the legacy-object transition window.
begin;

select plan(10);

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
    'location-photos',
    'a6400000-0000-0000-0000-000000000001/a6400000-0000-0000-0000-000000000012.jpg',
    'a6400000-0000-0000-0000-000000000001'
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
