-- #365: 「購入済みをクリア」時にアイテムを完全削除せず、購入履歴として
-- shopping_list_archive に保存する。設定 > 購入履歴 から過去の購入を振り返り、
-- 「再購入」でショッピングリストに戻せるようにする。

create table if not exists public.shopping_list_archive (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  desired_units int not null default 1 check (desired_units >= 1),
  note text,
  archived_at timestamptz not null default now()
);

create index if not exists shopping_list_archive_user_archived_idx
  on public.shopping_list_archive(user_id, archived_at desc);

alter table public.shopping_list_archive enable row level security;

create policy "shopping_list_archive_owner_all"
  on public.shopping_list_archive
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
