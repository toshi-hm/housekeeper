-- 本番DBには適用済み（Supabase MCP経由、2026-09-26）だったが、対応する
-- マイグレーションファイルがリポジトリにコミットされておらず、
-- `supabase/migrations/` と本番DBのマイグレーション履歴が乖離していた
-- （CI「Supabase Type Check」が shelf_scan_rate_limits テーブル /
-- check_shelf_scan_rate_limit 関数の型定義漏れで継続的に失敗していたことで発覚）。
-- 本番DBに実際に適用済みのSQLをそのままコミットし、履歴を一致させる。
--
-- 20260906000001_create_shelf_scan_rate_limits.sql と同一内容の
-- drop→再作成（既存データへの影響は無い設計: rate limitのウィンドウ行のみを保持するテーブルのため）。
drop function if exists public.check_shelf_scan_rate_limit();
drop table if exists public.shelf_scan_rate_limits;

create table public.shelf_scan_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  request_count int not null default 0
);

alter table public.shelf_scan_rate_limits enable row level security;
revoke all on table public.shelf_scan_rate_limits from public, anon, authenticated;

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

  if v_now - v_row.window_start > pg_catalog.make_interval(secs => v_window_seconds) then
    update public.shelf_scan_rate_limits
      set window_start = v_now, request_count = 1
      where user_id = v_user_id;
    return query select true, 0;
    return;
  end if;

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
