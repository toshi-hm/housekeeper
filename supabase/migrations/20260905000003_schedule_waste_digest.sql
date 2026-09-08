-- 週次食品ロスダイジェスト(send-waste-digest)のpg_cron定期実行(#925)
--
-- send-expiry-notifications-hourly（毎時0分実行、Edge Function側でユーザーごとの
-- notify_atと現在時刻をtimezone基準で突き合わせる #660）と同じパターンを踏襲する。
-- 配信曜日はspecの「やらないこと」により月曜固定なので、月曜のみ毎時0分に実行し、
-- Edge Function側でnotify_atの「時」に一致するユーザーにのみ送信する
-- （対象週の重複評価はwaste_streaks.last_evaluated_weekで防止、専用ログテーブルは
-- 新設しない）。
--
-- 前提: send-expiry-notifications-hourly と同じVault secrets
--   (project_url, service_role_key, cron_secret) を共用する。

select cron.unschedule('send-waste-digest-monday')
where exists (select 1 from cron.job where jobname = 'send-waste-digest-monday');

select cron.schedule(
  'send-waste-digest-monday',
  '0 * * * 1',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-waste-digest?scheduled=true',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
