-- Add DB-level uniqueness for name-matched planned shopping rows (#766).
--
-- upsertShoppingItem's free-text dedup (no linked_item_id) only checks for
-- an existing name match client-side before deciding to insert vs. merge —
-- there was no DB constraint backing it, unlike the linked_item_id path
-- (shopping_planned_linked_item_unique, 20260720104000_add_auto_reorder.sql).
-- Two concurrent adds of the same free-text name (e.g. two tabs/devices)
-- could both read "no duplicate yet" and both insert, creating two rows.
--
-- Mirrors that same migration's shape: consolidate any legacy race-created
-- duplicates (same user_id + case/whitespace-insensitive name, still
-- planned, no linked_item_id) onto the oldest row before adding the index,
-- then enforce uniqueness at the DB level going forward.

with duplicate_groups as (
  select
    user_id,
    lower(trim(name)) as normalized_name,
    min(id::text)::uuid as keep_id,
    sum(desired_units)::integer as total_units,
    string_agg(note, E'\n' order by created_at, id) filter (where note is not null) as notes
  from public.shopping_list_items
  where status = 'planned' and linked_item_id is null
  group by user_id, lower(trim(name))
  having count(*) > 1
)
update public.shopping_list_items as item
set desired_units = duplicates.total_units,
    note = coalesce(duplicates.notes, item.note),
    updated_at = now()
from duplicate_groups as duplicates
where item.id = duplicates.keep_id;

with duplicate_groups as (
  select user_id, lower(trim(name)) as normalized_name, min(id::text)::uuid as keep_id
  from public.shopping_list_items
  where status = 'planned' and linked_item_id is null
  group by user_id, lower(trim(name))
  having count(*) > 1
)
delete from public.shopping_list_items as item
using duplicate_groups as duplicates
where item.user_id = duplicates.user_id
  and lower(trim(item.name)) = duplicates.normalized_name
  and item.status = 'planned'
  and item.linked_item_id is null
  and item.id <> duplicates.keep_id;

create unique index if not exists shopping_planned_name_unique
  on public.shopping_list_items(user_id, lower(trim(name)))
  where status = 'planned' and linked_item_id is null;
