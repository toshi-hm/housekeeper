-- Household-scoped storage paths for shared item images and location photos.
-- Existing user-prefixed objects remain readable by their owner and by
-- members of the household that still references the object. They are copied
-- by the separately run migration utility; this migration never moves data.

drop policy if exists "item_images_owner_select" on storage.objects;
drop policy if exists "item_images_owner_insert" on storage.objects;
drop policy if exists "item_images_owner_update" on storage.objects;
drop policy if exists "item_images_owner_delete" on storage.objects;

create policy item_images_household_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'item-images'
    and (
      (storage.foldername(name))[1] = (select private.current_household_id())::text
      or (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.items i
        where i.image_path = storage.objects.name
          and i.household_id = (select private.current_household_id())
      )
    )
  );

create policy item_images_household_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select private.current_household_id())::text
  );

create policy item_images_household_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select private.current_household_id())::text
  )
  with check (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select private.current_household_id())::text
  );

create policy item_images_household_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select private.current_household_id())::text
  );

drop policy if exists "location_photos_owner_select" on storage.objects;
drop policy if exists "location_photos_owner_insert" on storage.objects;
drop policy if exists "location_photos_owner_update" on storage.objects;
drop policy if exists "location_photos_owner_delete" on storage.objects;

create policy location_photos_household_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'location-photos'
    and (
      (storage.foldername(name))[1] = (select private.current_household_id())::text
      or (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.storage_locations l
        where l.photo_path = storage.objects.name
          and l.household_id = (select private.current_household_id())
      )
    )
  );

create policy location_photos_household_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'location-photos'
    and (storage.foldername(name))[1] = (select private.current_household_id())::text
  );

create policy location_photos_household_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'location-photos'
    and (storage.foldername(name))[1] = (select private.current_household_id())::text
  )
  with check (
    bucket_id = 'location-photos'
    and (storage.foldername(name))[1] = (select private.current_household_id())::text
  );

create policy location_photos_household_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'location-photos'
    and (storage.foldername(name))[1] = (select private.current_household_id())::text
  );
