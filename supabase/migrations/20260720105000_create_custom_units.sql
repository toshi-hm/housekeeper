-- #420: User-defined content units. items.content_unit stores copied text and
-- intentionally has no foreign key to this table, so deleting a custom unit
-- does not change existing inventory records.

create table public.custom_units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  constraint custom_units_name_valid check (
    name = btrim(name)
    and char_length(name) between 1 and 40
  ),
  constraint custom_units_name_not_preset check (
    name <> all (array['個', '枚', '本', '袋', 'mL', 'L', 'g', 'kg']::text[])
  ),
  unique (user_id, name)
);

create index custom_units_user_id_idx on public.custom_units(user_id);

alter table public.custom_units enable row level security;

create policy "custom_units_owner_all"
  on public.custom_units
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on table public.custom_units from anon, authenticated;
grant select, insert, delete on table public.custom_units to authenticated;
