create table public.user_security_questions (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  email     text not null,
  question  text not null,
  answer_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_security_questions enable row level security;

create policy "user_security_questions_owner_all" on public.user_security_questions for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger user_security_questions_set_updated_at
  before update on public.user_security_questions
  for each row execute function public.set_updated_at();
