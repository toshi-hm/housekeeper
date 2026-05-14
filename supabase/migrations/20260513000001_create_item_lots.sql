-- item_lots: per-purchase inventory batches
-- Each item can have multiple lots with individual expiry/purchase dates.
create table item_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  units int not null default 1 check (units >= 0),
  opened_remaining numeric(12,2) check (opened_remaining is null or opened_remaining >= 0),
  purchase_date date,
  expiry_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index item_lots_item_idx on item_lots(item_id, created_at asc);
create index item_lots_user_idx on item_lots(user_id);
create index item_lots_expiry_idx on item_lots(expiry_date);

alter table item_lots enable row level security;
create policy "item_lots_owner_all" on item_lots for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger item_lots_set_updated_at before update on item_lots
  for each row execute function public.set_updated_at();

-- Migrate existing active items: create one lot per item
insert into item_lots (user_id, item_id, units, opened_remaining, purchase_date, expiry_date, created_at, updated_at)
select user_id, id, units, opened_remaining, purchase_date, expiry_date, created_at, updated_at
from items
where deleted_at is null;
