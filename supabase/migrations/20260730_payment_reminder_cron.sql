-- 未入金督促の毎日自動実行（pg_cron + pg_net）
--
-- ⚠️ このファイルを流す前に、督促用の共有シークレットを Vault に登録すること。
--    値は Edge Function の secret `REMINDER_CRON_SECRET` と同じもの。git には入れない。
--
--    select vault.create_secret('<REMINDER_CRON_SECRET>', 'reminder_cron_secret', 'payment-reminder 起動用');
--
--    登録済みか確認: select name from vault.secrets;
--
-- Authorization に入れているのは publishable キー（フロントのJSにも入っている公開鍵）。
-- Edge Function の入口ゲートを通すためだけのもので、実際の認可は x-cron-secret で行う。

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 再実行できるように既存ジョブを消してから登録
SELECT cron.unschedule('payment-reminder-daily')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'payment-reminder-daily');

-- 毎日 01:00 UTC = 日本時間 10:00 に実行
SELECT cron.schedule(
  'payment-reminder-daily',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jdkwijdphlkrcoiggfqw.supabase.co/functions/v1/payment-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      -- ↓実行時に実際の publishable キー（sb_publishable_...）に置き換えること
      'Authorization', 'Bearer <PUBLISHABLE_KEY>',
      'x-cron-secret', (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'reminder_cron_secret'
      )
    ),
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- 動作確認用メモ
--   ジョブ一覧      : select jobid, jobname, schedule, active from cron.job;
--   直近の実行結果  : select * from cron.job_run_details order by start_time desc limit 10;
--   HTTPの応答      : select id, status_code, content from net._http_response order by created desc limit 5;
