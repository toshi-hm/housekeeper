-- Notification logs for daily de-duplication (#354)
-- 期限アラートの定期送信が二重送信されないよう、ユーザーごとに「送信日」を記録する。

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- JST 基準の送信日。1 ユーザー 1 日 1 通までを保証する。
  sent_on date not null default (now() at time zone 'Asia/Tokyo')::date,
  item_count int not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, sent_on)
);

create index if not exists notification_logs_user_idx
  on public.notification_logs(user_id, sent_on desc);

alter table public.notification_logs enable row level security;

-- ユーザーは自分の送信ログを参照のみ可能（書き込みは service_role の Edge Function のみ）。
create policy "notification_logs_owner_select"
  on public.notification_logs
  for select
  using (auth.uid() = user_id);
