-- Opt-in channel for daily-goods stock alerts. Existing users remain opted out.
alter table public.notification_preferences
  add column low_stock_enabled boolean not null default false;

-- Per-item state suppresses repeat alerts until stock is replenished.
create table public.low_stock_notification_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.items(id) on delete cascade,
  notified_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index low_stock_notification_states_user_idx
  on public.low_stock_notification_states(user_id);

alter table public.low_stock_notification_states enable row level security;
create policy "low_stock_notification_states_owner_select"
  on public.low_stock_notification_states for select
  using (auth.uid() = user_id);

-- No client INSERT/UPDATE/DELETE policies are created; writes are service-role only.

-- Every hour; the function matches each opted-in user's notify_at and timezone.
select cron.unschedule('send-low-stock-notifications-hourly')
where exists (select 1 from cron.job where jobname = 'send-low-stock-notifications-hourly');

select cron.schedule(
  'send-low-stock-notifications-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-low-stock-notifications?scheduled=true',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
