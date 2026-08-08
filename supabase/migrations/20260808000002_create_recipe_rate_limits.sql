-- Per-user rate limit for the recipe-suggest Edge Function (#786).
-- recipe-suggest calls out to the external Rakuten Recipe API using a single
-- shared RECIPE_API_KEY (docs/specs/features/expiry-alert.md). Unlike
-- inventory-chat, it previously only checked authentication, so a single
-- user could exhaust the external API's quota (and any associated billing)
-- by hammering the endpoint. Mirrors chat_rate_limits /
-- check_chat_rate_limit() (#558) exactly — same fixed-window shape and same
-- thresholds — since recipe-suggest guards an equivalent
-- "one authenticated user must not be able to burn through a shared external
-- API quota" concern.

create table if not exists public.recipe_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null default now(),
  request_count int not null default 0
);

alter table public.recipe_rate_limits enable row level security;
revoke all on table public.recipe_rate_limits from public, anon, authenticated;
-- No policies: only ever read/written by the check_recipe_rate_limit()
-- SECURITY DEFINER function below, called via the recipe-suggest Edge
-- Function's user-scoped (anon key + JWT) client. No direct client access,
-- and no service-role key is used (matches inventory-chat's existing
-- RLS-only data access pattern).

-- Atomically checks and records a recipe-suggest request for the *calling*
-- user (derived from auth.uid(), not a client-supplied identifier, since
-- this is always invoked with the requesting user's own JWT). Uses a fixed
-- window: once the server-owned 60-second window has elapsed since
-- window_start, the count resets. Returns allowed = false once more than
-- the server-owned 20 requests have been made inside the current window,
-- along with how many seconds remain. Constants intentionally match
-- check_chat_rate_limit()'s.
create or replace function public.check_recipe_rate_limit()
returns table (allowed boolean, retry_after_seconds int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max_requests constant int := 20;
  v_window_seconds constant int := 60;
  v_user_id uuid := auth.uid();
  v_row public.recipe_rate_limits%rowtype;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    -- No authenticated user in context; fail closed rather than allow.
    return query select false, v_window_seconds;
    return;
  end if;

  insert into public.recipe_rate_limits (user_id, window_start, request_count)
    values (v_user_id, v_now, 0)
    on conflict (user_id) do nothing;

  select * into v_row
    from public.recipe_rate_limits
    where user_id = v_user_id
    for update;

  -- The fixed window has expired: start a fresh count for this request.
  if v_now - v_row.window_start > pg_catalog.make_interval(secs => v_window_seconds) then
    update public.recipe_rate_limits
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

  update public.recipe_rate_limits
    set request_count = v_row.request_count + 1
    where user_id = v_user_id;
  return query select true, 0;
end;
$$;

revoke all on function public.check_recipe_rate_limit() from public;
grant execute on function public.check_recipe_rate_limit() to authenticated;
