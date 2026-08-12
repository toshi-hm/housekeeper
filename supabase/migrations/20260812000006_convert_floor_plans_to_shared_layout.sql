-- v1.9: make the floor plan user-wide and store storage locations as markers.
-- Existing per-location plans are consolidated deterministically: the most
-- recently updated plan becomes the shared document, while every old location
-- receives a marker at the center of that document.

begin;

create temporary table floor_plan_migration_map on commit drop as
with canonical as (
  select distinct on (user_id)
    id,
    user_id,
    document,
    updated_at,
    created_at
  from public.floor_plans
  order by user_id, updated_at desc, created_at desc, id
)
select
  old_plan.id as old_floor_plan_id,
  old_plan.user_id,
  old_plan.storage_location_id,
  canonical.id as shared_floor_plan_id,
  canonical.document as shared_document,
  old_plan.updated_at as old_plan_updated_at
from public.floor_plans old_plan
join canonical on canonical.user_id = old_plan.user_id;

create table public.floor_plans_shared (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Deprecated compatibility column for clients deployed before the shared-plan migration.
  storage_location_id uuid references public.storage_locations(id) on delete set null,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  schema_version integer not null default 1 check (schema_version = 1),
  document jsonb not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

insert into public.floor_plans_shared (
  id,
  user_id,
  storage_location_id,
  name,
  schema_version,
  document,
  revision,
  created_at,
  updated_at
)
select distinct on (fp.user_id)
  fp.id,
  fp.user_id,
  fp.storage_location_id,
  fp.name,
  fp.schema_version,
  fp.document,
  fp.revision,
  fp.created_at,
  fp.updated_at
from public.floor_plans fp
order by fp.user_id, fp.updated_at desc, fp.created_at desc, fp.id;

create table public.floor_plan_storage_location_markers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  floor_plan_id uuid not null references public.floor_plans_shared(id) on delete cascade,
  storage_location_id uuid not null references public.storage_locations(id) on delete cascade,
  object_id text,
  x numeric(12,3) not null check (x >= 0),
  y numeric(12,3) not null check (y >= 0),
  z numeric(12,3) not null default 0 check (z >= 0),
  rotation numeric(8,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (floor_plan_id, storage_location_id)
);

insert into public.floor_plan_storage_location_markers (
  user_id,
  floor_plan_id,
  storage_location_id,
  x,
  y
)
select distinct on (migration_map.shared_floor_plan_id, migration_map.storage_location_id)
  migration_map.user_id,
  migration_map.shared_floor_plan_id,
  migration_map.storage_location_id,
  coalesce((migration_map.shared_document ->> 'width')::numeric / 2, 0),
  coalesce((migration_map.shared_document ->> 'height')::numeric / 2, 0)
from floor_plan_migration_map migration_map
order by
  migration_map.shared_floor_plan_id,
  migration_map.storage_location_id,
  migration_map.old_plan_updated_at desc,
  migration_map.old_floor_plan_id;

create table public.floor_plan_item_placements_shared (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  floor_plan_id uuid not null references public.floor_plans_shared(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  object_id text,
  x numeric(12,3) not null check (x >= 0),
  y numeric(12,3) not null check (y >= 0),
  z numeric(12,3) not null default 0 check (z >= 0),
  rotation numeric(8,3) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (floor_plan_id, item_id)
);

insert into public.floor_plan_item_placements_shared (
  id,
  user_id,
  floor_plan_id,
  item_id,
  object_id,
  x,
  y,
  z,
  rotation,
  created_at,
  updated_at
)
select distinct on (migration_map.shared_floor_plan_id, placement.item_id)
  placement.id,
  placement.user_id,
  migration_map.shared_floor_plan_id,
  placement.item_id,
  placement.object_id,
  placement.x,
  placement.y,
  placement.z,
  placement.rotation,
  placement.created_at,
  placement.updated_at
from public.floor_plan_item_placements placement
join floor_plan_migration_map migration_map
  on migration_map.old_floor_plan_id = placement.floor_plan_id
order by
  migration_map.shared_floor_plan_id,
  placement.item_id,
  migration_map.old_plan_updated_at desc,
  placement.updated_at desc,
  placement.created_at desc,
  placement.id;

drop table public.floor_plan_item_placements;
drop table public.floor_plans;

alter table public.floor_plans_shared rename to floor_plans;
alter table public.floor_plan_item_placements_shared rename to floor_plan_item_placements;

create index floor_plans_user_id_idx on public.floor_plans(user_id);
create index floor_plan_storage_location_markers_plan_idx
  on public.floor_plan_storage_location_markers(floor_plan_id);
create index floor_plan_storage_location_markers_location_idx
  on public.floor_plan_storage_location_markers(storage_location_id);
create index floor_plan_item_placements_plan_idx
  on public.floor_plan_item_placements(floor_plan_id);
create index floor_plan_item_placements_item_idx
  on public.floor_plan_item_placements(item_id);

alter table public.floor_plans enable row level security;
alter table public.floor_plan_storage_location_markers enable row level security;
alter table public.floor_plan_item_placements enable row level security;

create policy "floor_plans_owner_all" on public.floor_plans
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "floor_plan_storage_location_markers_owner_all"
  on public.floor_plan_storage_location_markers
  for all to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.floor_plans plan
      where plan.id = floor_plan_storage_location_markers.floor_plan_id
        and plan.user_id = auth.uid()
    )
    and exists (
      select 1 from public.storage_locations location
      where location.id = floor_plan_storage_location_markers.storage_location_id
        and location.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.floor_plans plan
      where plan.id = floor_plan_storage_location_markers.floor_plan_id
        and plan.user_id = auth.uid()
    )
    and exists (
      select 1 from public.storage_locations location
      where location.id = floor_plan_storage_location_markers.storage_location_id
        and location.user_id = auth.uid()
    )
  );

create policy "floor_plan_item_placements_owner_all"
  on public.floor_plan_item_placements
  for all to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.floor_plans plan
      where plan.id = floor_plan_item_placements.floor_plan_id
        and plan.user_id = auth.uid()
    )
    and exists (
      select 1 from public.items item
      where item.id = floor_plan_item_placements.item_id
        and item.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.floor_plans plan
      where plan.id = floor_plan_item_placements.floor_plan_id
        and plan.user_id = auth.uid()
    )
    and exists (
      select 1 from public.items item
      where item.id = floor_plan_item_placements.item_id
        and item.user_id = auth.uid()
    )
  );

create trigger floor_plans_set_updated_at
  before update on public.floor_plans
  for each row execute function public.set_updated_at();
create trigger floor_plan_storage_location_markers_set_updated_at
  before update on public.floor_plan_storage_location_markers
  for each row execute function public.set_updated_at();
create trigger floor_plan_item_placements_set_updated_at
  before update on public.floor_plan_item_placements
  for each row execute function public.set_updated_at();

grant select, insert, update, delete on table public.floor_plans to authenticated;
grant select, insert, update, delete
  on table public.floor_plan_storage_location_markers to authenticated;
grant select, insert, update, delete
  on table public.floor_plan_item_placements to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'floor_plans'
  ) then
    alter publication supabase_realtime add table public.floor_plans;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'floor_plan_storage_location_markers'
  ) then
    alter publication supabase_realtime add table public.floor_plan_storage_location_markers;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'floor_plan_item_placements'
  ) then
    alter publication supabase_realtime add table public.floor_plan_item_placements;
  end if;
end
$$;

commit;
