-- #715: 在庫優先の週間献立プランナー（Weekly Meal Planner）。
--
-- 1日1枠、recipes への参照 or 自由記述メモのどちらかを持つ。recipe_id / note の
-- 「どちらか一方は必須」制約はアプリ側でのみ検証する（割当解除で両方 null に
-- 戻す操作を許可するため、DB制約では強制しない。docs/specs/features/meal-plan.md
-- の「データ」節を参照）。
create table if not exists public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  planned_date date not null,
  recipe_id uuid null references public.recipes(id) on delete set null,
  note text,
  executed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, planned_date)
);

create index if not exists meal_plans_user_date_idx on public.meal_plans(user_id, planned_date);

alter table public.meal_plans enable row level security;

create policy "meal_plans_owner_all" on public.meal_plans for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists meal_plans_set_updated_at on public.meal_plans;
create trigger meal_plans_set_updated_at before update on public.meal_plans
  for each row execute function public.set_updated_at();
