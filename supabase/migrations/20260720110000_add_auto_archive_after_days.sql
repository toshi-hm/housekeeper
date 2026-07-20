-- #419: Atomically archive expired, in-stock items for the current user.

alter table public.user_settings
  add column if not exists auto_archive_after_days integer default null
    check (auto_archive_after_days is null or auto_archive_after_days between 1 and 365);

create or replace function public.auto_archive_expired_items()
returns table(id uuid, archived_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_after_days integer;
  v_archived_at timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select settings.auto_archive_after_days
    into v_after_days
    from public.user_settings as settings
    where settings.user_id = v_user_id;

  if v_after_days is null then
    return;
  end if;

  return query
    update public.items as item
      set deleted_at = v_archived_at,
          updated_at = v_archived_at
      where item.user_id = v_user_id
        and item.deleted_at is null
        and item.units > 0
        and item.expiry_date is not null
        and item.expiry_date <= current_date - v_after_days
      returning item.id, v_archived_at;
end;
$$;

create or replace function public.undo_auto_archive(
  p_item_ids uuid[],
  p_archived_at timestamptz
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  with restored as (
    update public.items as item
      set deleted_at = null,
          updated_at = clock_timestamp()
      where item.user_id = (select auth.uid())
        and item.id = any (p_item_ids)
        and item.deleted_at = p_archived_at
      returning 1
  )
  select count(*)::integer from restored;
$$;

revoke all on function public.auto_archive_expired_items() from public;
revoke all on function public.undo_auto_archive(uuid[], timestamptz) from public;
grant execute on function public.auto_archive_expired_items() to authenticated;
grant execute on function public.undo_auto_archive(uuid[], timestamptz) to authenticated;
