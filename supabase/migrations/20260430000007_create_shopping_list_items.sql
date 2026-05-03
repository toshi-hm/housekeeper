create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  desired_units int not null default 1 check (desired_units >= 1),
  note text,
  linked_item_id uuid references public.items(id) on delete set null,
  status text not null check (status in ('planned','purchased')) default 'planned',
  purchased_at timestamptz,
  created_item_id uuid references public.items(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shopping_user_status_idx
  on public.shopping_list_items(user_id, status, created_at desc);

alter table public.shopping_list_items enable row level security;

create policy "Users can manage their own shopping list"
  on public.shopping_list_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger update_shopping_list_items_updated_at
  before update on public.shopping_list_items
  for each row
  execute function update_updated_at_column();
