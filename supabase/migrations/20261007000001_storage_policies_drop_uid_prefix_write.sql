-- 世帯を抜けた元メンバー（旧世帯の画像を auth.uid() プレフィックスだけで操作できる）を防ぐ。
-- update/delete は現在の世帯プレフィックス、または現在の世帯に紐づく legacy マッピングのみ許可する。
-- legacy パスは private.household_legacy_storage_objects に記録済みのため、uid プレフィックスの無条件許可は不要。

drop policy if exists item_images_household_update on storage.objects;
drop policy if exists item_images_household_delete on storage.objects;

create policy item_images_household_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'item-images'
    and (
      (storage.foldername(name))[1] = (select private.current_household_id())::text
      or private.household_legacy_storage_object_access(bucket_id, name, false)
    )
  )
  with check (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = (select private.current_household_id())::text
  );

create policy item_images_household_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'item-images'
    and (
      (storage.foldername(name))[1] = (select private.current_household_id())::text
      or private.household_legacy_storage_object_access(bucket_id, name, false)
    )
  );

drop policy if exists location_photos_household_update on storage.objects;
drop policy if exists location_photos_household_delete on storage.objects;

create policy location_photos_household_update
  on storage.objects for update to authenticated
  using (
    bucket_id = 'location-photos'
    and (
      (storage.foldername(name))[1] = (select private.current_household_id())::text
      or private.household_legacy_storage_object_access(bucket_id, name, false)
    )
  )
  with check (
    bucket_id = 'location-photos'
    and (storage.foldername(name))[1] = (select private.current_household_id())::text
  );

create policy location_photos_household_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'location-photos'
    and (
      (storage.foldername(name))[1] = (select private.current_household_id())::text
      or private.household_legacy_storage_object_access(bucket_id, name, false)
    )
  );
