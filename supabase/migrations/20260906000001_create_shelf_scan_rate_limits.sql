-- Per-user rate limit for the shelf-scan Edge Function (#927).
-- Image analysis via Gemini Vision consumes the same shared free-tier quota
-- per call as receipt-scan's, so this mirrors check_receipt_scan_rate_limit()
-- exactly: same fixed-window shape (60秒あたり5回), same "derive the user
-- from auth.uid(), never a client-supplied identifier" design
-- (see 20260813000001_create_receipt_scan_rate_limits.sql).

create table if not exists public.shelf_scan_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  request_count int not null default 0
);

alter table public.shelf_scan_rate_limits enable row level security;
revoke all on table public.shelf_scan_rate_limits from public, anon, authenticated;
-- No policies: only ever read/written by the check_shelf_scan_rate_limit()
-- SECURITY DEFINER function below, called via the shelf-scan Edge Function's
-- user-scoped (anon key + JWT) client. No direct client access, and no
-- service-role key is used.

create or replace function public.check_shelf_scan_rate_limit()
returns table (allowed boolean, retry_after_seconds int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_requests constant int := 5;
  v_window_seconds constant int := 60;
  v_user_id uuid := auth.uid();
  v_row public.shelf_scan_rate_limits%rowtype;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    -- No authenticated user in context; fail closed rather than allow.
    return query select false, v_window_seconds;
    return;
  end if;

  insert into public.shelf_scan_rate_limits (user_id, window_start, request_count)
    values (v_user_id, v_now, 0)
    on conflict (user_id) do nothing;

  select * into v_row
    from public.shelf_scan_rate_limits
    where user_id = v_user_id
    for update;

  -- The fixed window has expired: start a fresh count for this request.
  if v_now - v_row.window_start > pg_catalog.make_interval(secs => v_window_seconds) then
    update public.shelf_scan_rate_limits
      set window_start = v_now, request_count = 1
      where user_id = v_user_id;
    return query select true, 0;
    return;
  end if;

  -- Still inside the window: would this request exceed the max?
  if v_row.request_count + 1 > v_max_requests then
    return query select
      false,
      greatest(
        1,
        ceil(extract(epoch from (
          v_row.window_start + pg_catalog.make_interval(secs => v_window_seconds) - v_now
        )))
      )::int;
    return;
  end if;

  update public.shelf_scan_rate_limits
    set request_count = v_row.request_count + 1
    where user_id = v_user_id;
  return query select true, 0;
end;
$$;

revoke all on function public.check_shelf_scan_rate_limit() from public;
grant execute on function public.check_shelf_scan_rate_limit() to authenticated;
