-- RLS regression tests for tables that are intentionally NOT fully
-- client-writable:
--
-- - notification_logs: RLS has a SELECT-only policy for the owner; writes
--   are performed exclusively by the send-expiry-notifications Edge
--   Function using the service_role key (which bypasses RLS entirely).
-- - security_reset_attempts: RLS is enabled with NO policies at all — the
--   table is only ever touched by Edge Functions via service_role. Every
--   operation from a normal authenticated/anon session must be denied,
--   regardless of which user is asking (there is no per-user ownership
--   concept on this table).
begin;

select plan(9);

insert into auth.users (id, email)
values ('11111111-1111-1111-1111-111111111111', 'user-a+rls-service@example.com');

insert into notification_logs (id, user_id, sent_on, item_count)
values ('eeeeeeee-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', current_date, 3);

insert into security_reset_attempts (scope, identifier)
values ('password-reset', 'user-a+rls-service@example.com');

-- ===== notification_logs =====

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select is((select count(*) from notification_logs)::int, 1, 'owner can SELECT their own notification_logs row');

select set_config('request.jwt.claims', json_build_object('sub', '22222222-2222-2222-2222-222222222222', 'role', 'authenticated')::text, true);

select is((select count(*) from notification_logs)::int, 0, 'other user cannot SELECT another user''s notification_logs row');

select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-1111-1111-111111111111', 'role', 'authenticated')::text, true);

select throws_ok(
  $$insert into notification_logs (user_id, sent_on, item_count) values ('11111111-1111-1111-1111-111111111111', current_date + 1, 1)$$,
  '42501',
  'new row violates row-level security policy for table "notification_logs"',
  'even the owner cannot INSERT into notification_logs directly (no INSERT policy; service_role/Edge Function only)'
);

with upd as (
  update notification_logs set item_count = 99 where id = 'eeeeeeee-0000-0000-0000-000000000001' returning 1
)
select is((select count(*)::int from upd), 0, 'even the owner cannot UPDATE their own notification_logs row (no UPDATE policy)');

with del as (
  delete from notification_logs where id = 'eeeeeeee-0000-0000-0000-000000000001' returning 1
)
select is((select count(*)::int from del), 0, 'even the owner cannot DELETE their own notification_logs row (no DELETE policy)');

-- ===== security_reset_attempts (no policies at all: deny-all for clients) =====

select is((select count(*) from security_reset_attempts)::int, 0, 'authenticated client cannot SELECT any security_reset_attempts row');

select throws_ok(
  $$insert into security_reset_attempts (scope, identifier) values ('password-reset', 'someone-else@example.com')$$,
  '42501',
  'new row violates row-level security policy for table "security_reset_attempts"',
  'authenticated client cannot INSERT into security_reset_attempts (service_role only)'
);

with upd as (
  update security_reset_attempts set attempt_count = 99 where scope = 'password-reset' and identifier = 'user-a+rls-service@example.com' returning 1
)
select is((select count(*)::int from upd), 0, 'authenticated client cannot UPDATE security_reset_attempts');

with del as (
  delete from security_reset_attempts where scope = 'password-reset' and identifier = 'user-a+rls-service@example.com' returning 1
)
select is((select count(*)::int from del), 0, 'authenticated client cannot DELETE security_reset_attempts');

select * from finish();

rollback;
