create table consumption_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references items(id) on delete cascade,
  delta_amount numeric(12,2) not null check (delta_amount > 0),
  delta_unit text not null,
  units_before int not null,
  units_after int not null,
  opened_remaining_before numeric(12,2),
  opened_remaining_after numeric(12,2),
  occurred_at timestamptz not null default now()
);

create index consumption_logs_item_idx on consumption_logs(item_id, occurred_at desc);
create index consumption_logs_user_idx on consumption_logs(user_id, occurred_at desc);

alter table consumption_logs enable row level security;
create policy "consumption_logs_owner_all" on consumption_logs for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
