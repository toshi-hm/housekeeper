-- notification_preferences: per-user push/email settings (v1.2)
create table notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default false,
  email_enabled boolean not null default false,
  email_address text,
  threshold_days int not null default 3 check (threshold_days >= 0),
  notify_at time not null default '08:00',
  updated_at timestamptz not null default now()
);

alter table notification_preferences enable row level security;
create policy "notification_preferences_owner_all" on notification_preferences for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- push_subscriptions: Web Push endpoints per device (v1.2)
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;
create policy "push_subscriptions_owner_all" on push_subscriptions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
