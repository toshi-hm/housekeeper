-- v1.9: user-owned 2D floor plans and inventory placements.
-- 3D is derived client-side from the validated document; no renderer-specific
-- JSON is persisted.

create table if not exists public.floor_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_location_id uuid not null references public.storage_locations(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 80),
  schema_version integer not null default 1 check (schema_version = 1),
  document jsonb not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, storage_location_id)
);

create index if not exists floor_plans_user_id_idx on public.floor_plans(user_id);
create index if not exists floor_plans_location_idx on public.floor_plans(storage_location_id);

alter table public.floor_plans enable row level security;

grant select, insert, update, delete on table public.floor_plans to authenticated;

drop policy if exists "floor_plans_owner_all" on public.floor_plans;
create policy "floor_plans_owner_all" on public.floor_plans for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.storage_locations location
      where location.id = floor_plans.storage_location_id
        and location.user_id = auth.uid()
    )
  );

drop trigger if exists floor_plans_set_updated_at on public.floor_plans;
create trigger floor_plans_set_updated_at
  before update on public.floor_plans
  for each row execute function public.set_updated_at();

create table if not exists public.floor_plan_item_placements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  floor_plan_id uuid not null references public.floor_plans(id) on delete cascade,
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

create index if not exists floor_plan_item_placements_plan_idx
  on public.floor_plan_item_placements(floor_plan_id);
create index if not exists floor_plan_item_placements_item_idx
  on public.floor_plan_item_placements(item_id);

alter table public.floor_plan_item_placements enable row level security;

drop policy if exists "floor_plan_item_placements_owner_all" on public.floor_plan_item_placements;
create policy "floor_plan_item_placements_owner_all"
  on public.floor_plan_item_placements for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.floor_plans plan
      where plan.id = floor_plan_item_placements.floor_plan_id
        and plan.user_id = auth.uid()
    )
    and exists (
      select 1 from public.items item
      join public.floor_plans plan
        on plan.storage_location_id = item.storage_location_id
      where plan.id = floor_plan_item_placements.floor_plan_id
        and item.id = floor_plan_item_placements.item_id
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
      join public.floor_plans plan
        on plan.storage_location_id = item.storage_location_id
      where plan.id = floor_plan_item_placements.floor_plan_id
        and item.id = floor_plan_item_placements.item_id
        and item.user_id = auth.uid()
    )
  );

drop trigger if exists floor_plan_item_placements_set_updated_at
  on public.floor_plan_item_placements;
create trigger floor_plan_item_placements_set_updated_at
  before update on public.floor_plan_item_placements
  for each row execute function public.set_updated_at();

grant select, insert, update, delete
  on table public.floor_plan_item_placements to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'floor_plans'
  ) then
    alter publication supabase_realtime add table public.floor_plans;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'floor_plan_item_placements'
  ) then
    alter publication supabase_realtime add table public.floor_plan_item_placements;
  end if;
end
$$;
