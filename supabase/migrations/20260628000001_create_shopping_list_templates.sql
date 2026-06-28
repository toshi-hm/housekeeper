-- Shopping list templates (#201)
-- よく使う商品セットを保存し、ワンタップで買い物リストへ一括追加する。

create table if not exists public.shopping_list_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists shopping_list_templates_user_idx
  on public.shopping_list_templates(user_id, created_at desc);

alter table public.shopping_list_templates enable row level security;

create policy "shopping_list_templates_owner_all"
  on public.shopping_list_templates
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger shopping_list_templates_set_updated_at
  before update on public.shopping_list_templates
  for each row execute function public.set_updated_at();

create table if not exists public.shopping_list_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.shopping_list_templates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  desired_units int not null default 1 check (desired_units >= 1),
  created_at timestamptz not null default now()
);

create index if not exists shopping_list_template_items_template_idx
  on public.shopping_list_template_items(template_id);

alter table public.shopping_list_template_items enable row level security;

create policy "shopping_list_template_items_owner_all"
  on public.shopping_list_template_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
