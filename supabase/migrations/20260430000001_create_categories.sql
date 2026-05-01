create table categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index categories_user_id_idx on categories(user_id);

alter table categories enable row level security;
create policy "categories_owner_all" on categories for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger categories_set_updated_at before update on categories
  for each row execute function public.set_updated_at();
