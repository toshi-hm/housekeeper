create table storage_locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index storage_locations_user_id_idx on storage_locations(user_id);

alter table storage_locations enable row level security;
create policy "storage_locations_owner_all" on storage_locations for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger storage_locations_set_updated_at before update on storage_locations
  for each row execute function public.set_updated_at();
