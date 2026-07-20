-- #365: Preserve purchased shopping rows as immutable history.

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

-- DELETE ... RETURNING and INSERT share one statement/transaction. If the
-- archive insert fails, PostgreSQL restores the source rows. Concurrent calls
-- cannot archive the same source row twice because only one can delete it.
create or replace function public.archive_purchased_shopping_items()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  archived_count integer;
begin
  with moved_rows as (
    delete from public.shopping_list_items
    where user_id = auth.uid()
      and status = 'purchased'
    returning user_id, name, desired_units, note
  )
  insert into public.shopping_list_archive (
    user_id,
    name,
    desired_units,
    note,
    archived_at
  )
  select user_id, name, desired_units, note, statement_timestamp()
  from moved_rows;

  get diagnostics archived_count = row_count;
  return archived_count;
end;
$$;

revoke all on function public.archive_purchased_shopping_items() from public;
grant execute on function public.archive_purchased_shopping_items() to authenticated;
