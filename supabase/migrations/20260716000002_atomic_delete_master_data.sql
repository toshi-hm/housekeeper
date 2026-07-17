-- #491: Deleting a category/storage location previously did a client-side
-- "check usage -> confirm dialog -> delete" flow. Between the check and the
-- delete there was a multi-second window (the user reading the confirm
-- dialog) during which another device could assign the category/location to
-- a new item; that item's reference would then be silently lost when the
-- delete proceeded (FK is ON DELETE SET NULL).
--
-- These functions make the "0 referencing items" condition part of the
-- DELETE statement itself (single atomic statement), so the usage check and
-- the delete can no longer race apart. If the delete affects 0 rows because
-- the row is now in use, they raise a dedicated error code the client can
-- detect and surface as a normal "in use" validation message instead of a
-- generic error.

create or replace function public.delete_category_if_unused(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from categories
  where id = p_id
    and user_id = auth.uid()
    and not exists (
      select 1 from items
      where items.category_id = p_id
        and items.deleted_at is null
    );

  if not found then
    if exists (
      select 1 from items
      where items.category_id = p_id
        and items.deleted_at is null
    ) then
      raise exception 'category is in use' using errcode = 'HK001';
    end if;
    -- otherwise: row already gone / not owned by caller — treat as a no-op
    -- success, matching the previous plain DELETE's idempotent behavior.
  end if;
end;
$$;

grant execute on function public.delete_category_if_unused(uuid) to authenticated;

create or replace function public.delete_storage_location_if_unused(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from storage_locations
  where id = p_id
    and user_id = auth.uid()
    and not exists (
      select 1 from items
      where items.storage_location_id = p_id
        and items.deleted_at is null
    );

  if not found then
    if exists (
      select 1 from items
      where items.storage_location_id = p_id
        and items.deleted_at is null
    ) then
      raise exception 'storage location is in use' using errcode = 'HK002';
    end if;
  end if;
end;
$$;

grant execute on function public.delete_storage_location_if_unused(uuid) to authenticated;
