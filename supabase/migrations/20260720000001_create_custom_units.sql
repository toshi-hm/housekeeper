-- #420: Custom content units. CONTENT_UNITS (items.content_unit) was a fixed
-- hardcoded preset list (個/枚/本/袋/mL/L/g/kg). This table lets each user add
-- their own units (缶/パック/食/錠/ロール, etc.).
--
-- Unlike categories/storage_locations, items.content_unit is a plain text
-- column (not a foreign key), so deleting a custom unit here never affects
-- existing items — their content_unit value is copied text, not a reference.
-- No "in use" check is needed on delete.

create table custom_units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index custom_units_user_id_idx on custom_units(user_id);

alter table custom_units enable row level security;
create policy "custom_units_owner_all" on custom_units for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
