-- Brute-force protection for the password reset (secret question) flow (#433).
-- Tracks attempts per (scope, identifier) so get-security-question and
-- verify-security-answer can each enforce their own rate limit / lockout
-- window, keyed by the (lower-cased) email address supplied by the caller.

create table if not exists public.security_reset_attempts (
  scope text not null,
  identifier text not null,
  attempt_count int not null default 0,
  first_attempt_at timestamptz not null default now(),
  last_attempt_at timestamptz not null default now(),
  locked_until timestamptz,
  primary key (scope, identifier)
);

alter table public.security_reset_attempts enable row level security;
-- No policies: this table is only ever read/written by Edge Functions using
-- the service_role key, which bypasses RLS. No direct client access.

-- Atomically checks and records an attempt for (p_scope, p_identifier).
-- Returns allowed = false once more than p_max_attempts attempts have been
-- made inside p_window_minutes, applying an exponential backoff lockout
-- (capped at p_max_lockout_minutes) that grows with repeated abuse.
create or replace function public.check_security_reset_rate_limit(
  p_scope text,
  p_identifier text,
  p_max_attempts int default 5,
  p_window_minutes int default 15,
  p_base_lockout_minutes numeric default 1,
  p_max_lockout_minutes numeric default 60
) returns table (allowed boolean, retry_after_seconds int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.security_reset_attempts%rowtype;
  v_now timestamptz := now();
  v_lockout_minutes numeric;
begin
  insert into public.security_reset_attempts (scope, identifier, attempt_count, first_attempt_at, last_attempt_at)
    values (p_scope, p_identifier, 0, v_now, v_now)
    on conflict (scope, identifier) do nothing;

  select * into v_row
    from public.security_reset_attempts
    where scope = p_scope and identifier = p_identifier
    for update;

  -- Still inside an active lockout window.
  if v_row.locked_until is not null and v_row.locked_until > v_now then
    return query select false, ceil(extract(epoch from (v_row.locked_until - v_now)))::int;
    return;
  end if;

  -- The rolling window has expired: start a fresh count.
  if v_now - v_row.first_attempt_at > (p_window_minutes || ' minutes')::interval then
    update public.security_reset_attempts
      set attempt_count = 1, first_attempt_at = v_now, last_attempt_at = v_now, locked_until = null
      where scope = p_scope and identifier = p_identifier;
    return query select true, 0;
    return;
  end if;

  -- Still inside the window: would this attempt exceed the max?
  if v_row.attempt_count + 1 > p_max_attempts then
    v_lockout_minutes := least(
      p_max_lockout_minutes,
      p_base_lockout_minutes * power(2, v_row.attempt_count - p_max_attempts)
    );
    update public.security_reset_attempts
      set attempt_count = v_row.attempt_count + 1,
          last_attempt_at = v_now,
          locked_until = v_now + (v_lockout_minutes || ' minutes')::interval
      where scope = p_scope and identifier = p_identifier;
    return query select false, ceil(v_lockout_minutes * 60)::int;
    return;
  end if;

  update public.security_reset_attempts
    set attempt_count = v_row.attempt_count + 1, last_attempt_at = v_now
    where scope = p_scope and identifier = p_identifier;
  return query select true, 0;
end;
$$;

revoke all on function public.check_security_reset_rate_limit(text, text, int, int, numeric, numeric) from public;
grant execute on function public.check_security_reset_rate_limit(text, text, int, int, numeric, numeric) to service_role;
