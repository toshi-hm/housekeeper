-- Add unique constraint on email (case-insensitive) to prevent duplicate registrations
create unique index user_security_questions_email_unique on public.user_security_questions (lower(email));

-- Fix RLS with check to also verify email matches the authenticated user's JWT email
drop policy "user_security_questions_owner_all" on public.user_security_questions;

create policy "user_security_questions_owner_all" on public.user_security_questions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and lower(email) = lower(auth.email()));
