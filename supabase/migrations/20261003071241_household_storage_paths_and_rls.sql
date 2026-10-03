-- Household-scoped storage paths for shared item images and location photos.
-- Existing user-prefixed objects remain readable by their owner and by
-- members of the household that still references the object. They are copied
-- by the separately run migration utility; this migration never moves data.

-- Never trust a client-writable image_path/photo_path as ownership proof.
-- These fields may point only to the row's deterministic legacy or household
-- key, and the creator id is immutable after insert.
create table private.household_legacy_storage_objects (
  bucket_id text not null,
  object_name text not null,
  creator_user_id uuid not null,
  household_id uuid not null,
  entity_id uuid not null,
  primary key (bucket_id, object_name)
);

revoke all on table private.household_legacy_storage_objects from public, anon, authenticated;

insert into private.household_legacy_storage_objects (
  bucket_id,
  object_name,
  creator_user_id,
  household_id,
  entity_id
)
select 'item-images', i.image_path, i.user_id, i.household_id, i.id
from public.items i
where i.image_path ~ ('^' || i.user_id::text || '/' || i.id::text || '[.](jpg|jpeg|png|webp)$')
union all
select 'location-photos', l.photo_path, l.user_id, l.household_id, l.id
from public.storage_locations l
where l.photo_path ~ ('^' || l.user_id::text || '/' || l.id::text || '[.](jpg|jpeg|png|webp)$')
on conflict (bucket_id, object_name) do nothing;

create or replace function private.validate_household_storage_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  object_path text;
  valid_prefix_pattern text;
begin
  if tg_table_name = 'items' then
    object_path := new.image_path;
  else
    object_path := new.photo_path;
  end if;

  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Storage creator cannot be changed'
      using errcode = '23514';
  end if;

  if object_path is not null then
    valid_prefix_pattern := '^(' || new.household_id::text || '|' || new.user_id::text || ')/'
      || new.id::text || '[.](jpg|jpeg|png|webp)$';
    if object_path !~ valid_prefix_pattern then
      raise exception 'Storage path must match the row creator or household and entity id'
        using errcode = '23514';
    end if;

    if split_part(object_path, '/', 1) = new.user_id::text then
      insert into private.household_legacy_storage_objects (
        bucket_id,
        object_name,
        creator_user_id,
        household_id,
        entity_id
      ) values (
        case tg_table_name when 'items' then 'item-images' else 'location-photos' end,
        object_path,
        new.user_id,
        new.household_id,
        new.id
      )
      on conflict (bucket_id, object_name) do nothing;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_household_storage_reference() from public, anon, authenticated;

create trigger items_storage_reference_guard
  before insert or update of user_id, household_id, image_path on public.items
  for each row execute function private.validate_household_storage_reference();

create trigger storage_locations_storage_reference_guard
  before insert or update of user_id, household_id, photo_path on public.storage_locations
  for each row execute function private.validate_household_storage_reference();

-- This SECURITY DEFINER predicate ties legacy paths to an immutable creator,
-- household, and entity id. Reads require a live DB reference. Deletes use a
-- private mapping that survives row deletion until Storage confirms removal.
create or replace function private.household_legacy_storage_object_access(
  p_bucket_id text,
  p_object_name text,
  p_require_reference boolean
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case p_bucket_id
    when 'item-images' then
      (
        exists (
          select 1
          from public.items i
          where i.user_id::text = split_part(p_object_name, '/', 1)
            and split_part(p_object_name, '/', 2) ~ ('^' || i.id::text || '[.](jpg|jpeg|png|webp)$')
            and array_length(string_to_array(p_object_name, '/'), 1) = 2
            and i.household_id = private.current_household_id()
            and p_require_reference
            and i.image_path = p_object_name
        )
        or (
          not p_require_reference
          and exists (
            select 1
            from private.household_legacy_storage_objects legacy
            where legacy.bucket_id = p_bucket_id
              and legacy.object_name = p_object_name
              and legacy.creator_user_id::text = split_part(p_object_name, '/', 1)
              and legacy.entity_id::text = split_part(split_part(p_object_name, '/', 2), '.', 1)
              and legacy.household_id = private.current_household_id()
              and not exists (
                select 1
                from public.items current_item
                where current_item.id = legacy.entity_id
                  and (
                    current_item.user_id <> legacy.creator_user_id
                    or current_item.household_id <> legacy.household_id
                  )
              )
          )
        )
      )
    when 'location-photos' then
      (
        exists (
          select 1
          from public.storage_locations l
          where l.user_id::text = split_part(p_object_name, '/', 1)
            and split_part(p_object_name, '/', 2) ~ ('^' || l.id::text || '[.](jpg|jpeg|png|webp)$')
            and array_length(string_to_array(p_object_name, '/'), 1) = 2
            and l.household_id = private.current_household_id()
            and p_require_reference
            and l.photo_path = p_object_name
        )
        or (
          not p_require_reference
          and exists (
            select 1
            from private.household_legacy_storage_objects legacy
            where legacy.bucket_id = p_bucket_id
              and legacy.object_name = p_object_name
              and legacy.creator_user_id::text = split_part(p_object_name, '/', 1)
              and legacy.entity_id::text = split_part(split_part(p_object_name, '/', 2), '.', 1)
              and legacy.household_id = private.current_household_id()
              and not exists (
                select 1
                from public.storage_locations current_location
                where current_location.id = legacy.entity_id
                  and (
                    current_location.user_id <> legacy.creator_user_id
                    or current_location.household_id <> legacy.household_id
                  )
              )
          )
        )
      )
    else false
  end;
$$;

revoke all on function private.household_legacy_storage_object_access(text, text, boolean) from public;
grant execute on function private.household_legacy_storage_object_access(text, text, boolean) to authenticated;

create or replace function private.remove_household_legacy_storage_mapping()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from private.household_legacy_storage_objects
  where bucket_id = old.bucket_id
    and object_name = old.name;
  return old;
end;
$$;

revoke all on function private.remove_household_legacy_storage_mapping() from public, anon, authenticated;

create trigger remove_household_legacy_storage_mapping
  after delete on storage.objects
  for each row execute function private.remove_household_legacy_storage_mapping();

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
      or private.household_legacy_storage_object_access(bucket_id, name, true)
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
    and (
      (storage.foldername(name))[1] = (select private.current_household_id())::text
      or (storage.foldername(name))[1] = (select auth.uid())::text
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
      or (storage.foldername(name))[1] = (select auth.uid())::text
      or private.household_legacy_storage_object_access(bucket_id, name, false)
    )
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
      or private.household_legacy_storage_object_access(bucket_id, name, true)
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
    and (
      (storage.foldername(name))[1] = (select private.current_household_id())::text
      or (storage.foldername(name))[1] = (select auth.uid())::text
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
      or (storage.foldername(name))[1] = (select auth.uid())::text
      or private.household_legacy_storage_object_access(bucket_id, name, false)
    )
  );
