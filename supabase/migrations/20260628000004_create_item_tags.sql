-- Custom item tags (#249)
-- カテゴリ・保管場所とは独立した、複数付与可能な横断ラベル。

create table if not exists public.item_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists item_tags_user_idx on public.item_tags(user_id);

alter table public.item_tags enable row level security;

create policy "item_tags_owner_all"
  on public.item_tags
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- items ↔ item_tags 中間テーブル
create table if not exists public.items_to_tags (
  item_id uuid not null references public.items(id) on delete cascade,
  tag_id uuid not null references public.item_tags(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (item_id, tag_id)
);

create index if not exists items_to_tags_tag_idx on public.items_to_tags(tag_id);
create index if not exists items_to_tags_item_idx on public.items_to_tags(item_id);

alter table public.items_to_tags enable row level security;

create policy "items_to_tags_owner_all"
  on public.items_to_tags
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
