-- レシピ/セット消費機能 (#393)
-- 「朝のコーヒー」のようなテンプレートを登録し、実行するだけで構成アイテムを
-- 一括消費できるようにする。recipes は所有者を user_id で直接持つが、
-- recipe_items は recipes への従属エンティティのため直接の user_id を持たず、
-- recipes.user_id への join で所有権を判定する。

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists recipes_user_idx on public.recipes(user_id, created_at desc);

alter table public.recipes enable row level security;

create policy "recipes_owner_all"
  on public.recipes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

create table if not exists public.recipe_items (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists recipe_items_recipe_idx on public.recipe_items(recipe_id);
create index if not exists recipe_items_item_idx on public.recipe_items(item_id);

alter table public.recipe_items enable row level security;

-- recipe_items has no direct user_id column, so ownership is checked via a
-- join to recipes.user_id (matches the parent recipe's owner).
create policy "recipe_items_owner_all"
  on public.recipe_items
  for all
  using (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_items.recipe_id
        and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.recipes r
      where r.id = recipe_items.recipe_id
        and r.user_id = auth.uid()
    )
  );
