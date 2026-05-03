create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'ja' check (language in ('ja','en')),
  expiry_warning_days int not null default 3 check (expiry_warning_days >= 0),
  default_unit text not null default 'mL',
  notify_at time not null default '08:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;
create policy "user_settings_owner_all" on user_settings for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger user_settings_set_updated_at before update on user_settings
  for each row execute function public.set_updated_at();

-- Auto-insert settings row on new user signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_settings (user_id) values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
