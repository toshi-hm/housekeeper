-- waste_streaks: 週次「食品ロスゼロ」継続記録（#925）
--
-- 1 user 1 行。current_streak_weeks / longest_streak_weeks は週次バッチ
-- （send-waste-digest Edge Function、pg_cron 月曜配信）でのみ更新する。
-- spec の「やらないこと」: ストリーク評価は週次バッチ実行時のみで、クライアント側
-- では再計算しない（複数デバイスでの二重カウント防止）。そのため RLS は
-- notification_logs と同様に owner による SELECT のみを許可し、書き込みは
-- service_role（Edge Function）経由に限定する。
create table waste_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak_weeks int not null default 0 check (current_streak_weeks >= 0),
  longest_streak_weeks int not null default 0 check (longest_streak_weeks >= 0),
  -- 直近に評価済みの週の開始日（月曜）。週次バッチの重複実行防止に使う
  -- （同じ週を二重評価しない）。
  last_evaluated_week date,
  updated_at timestamptz not null default now()
);

alter table waste_streaks enable row level security;

-- ユーザーは自分のストリークを参照のみ可能。
create policy "waste_streaks_owner_select" on waste_streaks
  for select using (auth.uid() = user_id);

create trigger waste_streaks_set_updated_at before update on waste_streaks
  for each row execute function public.set_updated_at();
