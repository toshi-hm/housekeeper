-- Scheduled expiry notifications via pg_cron + pg_net (#354)
--
-- 毎時 send-expiry-notifications Edge Function を `?scheduled=true` で呼び出す。
-- Edge Function 側でユーザーごとの notify_at（通知時刻）と現在時刻(JST)を突き合わせ、
-- 該当ユーザーにのみ送信する。notification_logs により 1 日 1 通に制限される。
--
-- 前提:
--   1. pg_cron / pg_net 拡張が有効であること（下記で有効化）。
--   2. Supabase Vault に以下のシークレットを登録しておくこと:
--        select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--        select vault.create_secret('<service-role-key>', 'service_role_key');
--      （service_role_key は秘匿情報のためマイグレーションには直接書かない）

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 既存ジョブがあれば貼り替え（再実行の冪等性確保）
select cron.unschedule('send-expiry-notifications-hourly')
where exists (select 1 from cron.job where jobname = 'send-expiry-notifications-hourly');

-- 毎時 0 分に実行（Edge Function 側で notify_at に一致するユーザーのみ送信）
select cron.schedule(
  'send-expiry-notifications-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-expiry-notifications?scheduled=true',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
