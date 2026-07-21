-- Add automatic reorder settings and durable shopping-row provenance (#353).
alter table public.items
  add column if not exists auto_reorder boolean not null default false,
  add column if not exists reorder_threshold integer
    check (reorder_threshold is null or reorder_threshold >= 0);

alter table public.shopping_list_items
  add column if not exists auto_added boolean not null default false;

-- Consolidate any legacy race-created duplicates before enforcing uniqueness.
-- Quantities and notes are retained on the oldest representative row.
with duplicate_groups as (
  select
    user_id,
    linked_item_id,
    min(id::text)::uuid as keep_id,
    sum(desired_units)::integer as total_units,
    string_agg(note, E'\n' order by created_at, id) filter (where note is not null) as notes
  from public.shopping_list_items
  where status = 'planned' and linked_item_id is not null
  group by user_id, linked_item_id
  having count(*) > 1
)
update public.shopping_list_items as item
set desired_units = duplicates.total_units,
    note = coalesce(duplicates.notes, item.note),
    updated_at = now()
from duplicate_groups as duplicates
where item.id = duplicates.keep_id;

with duplicate_groups as (
  select user_id, linked_item_id, min(id::text)::uuid as keep_id
  from public.shopping_list_items
  where status = 'planned' and linked_item_id is not null
  group by user_id, linked_item_id
  having count(*) > 1
)
delete from public.shopping_list_items as item
using duplicate_groups as duplicates
where item.user_id = duplicates.user_id
  and item.linked_item_id = duplicates.linked_item_id
  and item.status = 'planned'
  and item.id <> duplicates.keep_id;

create unique index if not exists shopping_planned_linked_item_unique
  on public.shopping_list_items(user_id, linked_item_id)
  where status = 'planned' and linked_item_id is not null;
