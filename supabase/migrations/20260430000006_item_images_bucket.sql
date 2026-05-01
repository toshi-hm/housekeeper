-- Storage bucket for item images (run via Supabase dashboard or CLI)
-- This migration documents the required storage setup.
-- The bucket must be created via Supabase Storage API or dashboard.

-- Storage RLS policies (apply after bucket creation)
create policy "item_images_owner_select"
  on storage.objects for select
  using (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "item_images_owner_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "item_images_owner_update"
  on storage.objects for update
  using (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "item_images_owner_delete"
  on storage.objects for delete
  using (
    bucket_id = 'item-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
