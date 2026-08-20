-- 購入後フォローメールの毎日自動実行（2026-08-21）
--
-- 認可は x-cron-secret のみ。共有シークレットは payment-reminder と同じ vault の
-- 'reminder_cron_secret' を使う（Edge Function は LIFECYCLE_CRON_SECRET →
-- REMINDER_CRON_SECRET の順で読む）。
--
-- payment-reminder の cron は Authorization に publishable キーも入れているが、
-- この関数は --no-verify-jwt でデプロイしてあり**不要**（2026-08-21 に無しで200を実測）。
-- 鍵をSQLへ焼き込まないぶん、キー更新時に直す場所が減る。

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('ai-course-lifecycle-daily')
 where exists (select 1 from cron.job where jobname = 'ai-course-lifecycle-daily');

-- 毎日 01:30 UTC = 日本時間 10:30。
-- payment-reminder（01:00 UTC）と30分ずらす＝同時刻に外部APIへ束で投げない
select cron.schedule(
  'ai-course-lifecycle-daily',
  '30 1 * * *',
  $$
  select net.http_post(
    url := 'https://jdkwijdphlkrcoiggfqw.supabase.co/functions/v1/ai-course-lifecycle-mails',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret'
      )
    ),
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

-- 確認: select jobid, jobname, schedule, active from cron.job;
--       select * from cron.job_run_details order by start_time desc limit 5;
