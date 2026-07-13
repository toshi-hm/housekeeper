-- send-expiry-notifications の呼び出し元認証を追加 (#444)
--
-- send-expiry-notifications は Authorization ヘッダの有無しか検証しておらず、
-- 公開されている anon key でも Supabase の JWT 検証を通過してしまうため、
-- 誰でも全ユーザーへの通知一斉送信をトリガーできる状態だった。
-- Edge Function 側に X-Cron-Secret ヘッダーの照合を追加したため、
-- pg_cron からの呼び出しにも同じシークレットを付与するようジョブを貼り替える。
--
-- 前提:
--   Supabase Vault に以下のシークレットを追加で登録しておくこと:
--     select vault.create_secret('<ランダムな文字列>', 'cron_secret');
--   Edge Function 側にも同じ値を設定すること:
--     supabase secrets set CRON_SECRET=<同じランダムな文字列>

select cron.unschedule('send-expiry-notifications-hourly')
where exists (select 1 from cron.job where jobname = 'send-expiry-notifications-hourly');

select cron.schedule(
  'send-expiry-notifications-hourly',
  '0 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
           || '/functions/v1/send-expiry-notifications?scheduled=true',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
