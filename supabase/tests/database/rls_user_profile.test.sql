-- RLS regression tests for the per-user profile/settings tables:
-- user_settings, notification_preferences, push_subscriptions, and
-- user_security_questions.
begin;

select plan(16);

insert into auth.users (id, email)
values
  ('11111111-1111-1111-1111-111111111111', 'user-a+rls-profile@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'user-b+rls-profile@example.com');

-- NOTE: inserting into auth.users fires the on_auth_user_created trigger,
-- which auto-creates a user_settings row (on conflict do nothing) for both
-- users, so user_settings does not need a manual seed insert below.

insert into notification_preferences (user_id)
values ('11111111-1111-1111-1111-111111111111');

insert into push_subscriptions (id, user_id, endpoint, p256dh, auth)
values ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'https://push.example.com/a', 'p256dh-key', 'auth-key');

insert into user_security_questions (user_id, email, question, answer_hash)
values ('11111111-1111-1111-1111-111111111111', 'user-a+rls-profile@example.com', 'pet name?', 'hashed-answer');

-- ===== user_settings =====

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is((select count(*) from user_settings)::int, 1, 'owner can SELECT only their own user_settings row');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is(
  (select count(*) from user_settings where user_id = '11111111-1111-1111-1111-111111111111')::int,
  0,
  'other user cannot SELECT another user''s user_settings row'
);

with upd as (
  update user_settings set default_unit = 'hacked' where user_id = '11111111-1111-1111-1111-111111111111' returning 1
)
select is((select count(*)::int from upd), 0, 'other user cannot UPDATE another user''s user_settings row');

with del as (
  delete from user_settings where user_id = '11111111-1111-1111-1111-111111111111' returning 1
)
select is((select count(*)::int from del), 0, 'other user cannot DELETE another user''s user_settings row');

-- ===== notification_preferences =====

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is((select count(*) from notification_preferences)::int, 1, 'owner can SELECT their own notification_preferences row');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is((select count(*) from notification_preferences)::int, 0, 'other user cannot SELECT another user''s notification_preferences row');

with upd as (
  update notification_preferences set push_enabled = true where user_id = '11111111-1111-1111-1111-111111111111' returning 1
)
select is((select count(*)::int from upd), 0, 'other user cannot UPDATE another user''s notification_preferences row');

with del as (
  delete from notification_preferences where user_id = '11111111-1111-1111-1111-111111111111' returning 1
)
select is((select count(*)::int from del), 0, 'other user cannot DELETE another user''s notification_preferences row');

-- ===== push_subscriptions =====

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is((select count(*) from push_subscriptions)::int, 1, 'owner can SELECT their own push_subscriptions row');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is((select count(*) from push_subscriptions)::int, 0, 'other user cannot SELECT another user''s push_subscriptions row');

with upd as (
  update push_subscriptions set user_agent = 'hacked' where id = 'dddddddd-0000-0000-0000-000000000001' returning 1
)
select is((select count(*)::int from upd), 0, 'other user cannot UPDATE another user''s push_subscriptions row');

with del as (
  delete from push_subscriptions where id = 'dddddddd-0000-0000-0000-000000000001' returning 1
)
select is((select count(*)::int from del), 0, 'other user cannot DELETE another user''s push_subscriptions row');

-- ===== user_security_questions =====

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is((select count(*) from user_security_questions)::int, 1, 'owner can SELECT their own user_security_questions row');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is((select count(*) from user_security_questions)::int, 0, 'other user cannot SELECT another user''s user_security_questions row');

with upd as (
  update user_security_questions set question = 'hacked' where user_id = '11111111-1111-1111-1111-111111111111' returning 1
)
select is((select count(*)::int from upd), 0, 'other user cannot UPDATE another user''s user_security_questions row');

with del as (
  delete from user_security_questions where user_id = '11111111-1111-1111-1111-111111111111' returning 1
)
select is((select count(*)::int from del), 0, 'other user cannot DELETE another user''s user_security_questions row');

select * from finish();

rollback;
