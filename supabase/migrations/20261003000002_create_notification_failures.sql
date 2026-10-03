create table public.notification_failures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in ('expiry', 'waste_digest', 'low_stock')),
  channel text not null check (channel in ('push', 'email')),
  failure_code text not null check (failure_code in (
    'push_config_missing',
    'push_subscriptions_unavailable',
    'push_no_subscriptions',
    'push_delivery_failed',
    'email_config_missing',
    'email_address_missing',
    'email_delivery_failed'
  )),
  failed_at timestamptz not null default now()
);

create index notification_failures_user_failed_at_idx
  on public.notification_failures (user_id, failed_at desc);

alter table public.notification_failures enable row level security;

create policy "Users can read their own notification failures"
  on public.notification_failures
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.notification_failures from anon, authenticated, service_role;
grant select on public.notification_failures to authenticated;
grant insert on public.notification_failures to service_role;
