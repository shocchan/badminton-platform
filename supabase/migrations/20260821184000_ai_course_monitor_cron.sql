-- 運用監視の毎日自動実行（2026-08-21）
--
-- 認可は x-cron-secret のみ（lifecycle と同じ vault の 'reminder_cron_secret'）。
-- 関数は --no-verify-jwt でデプロイしてあるので Authorization ヘッダーは不要。

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('ai-course-monitor-daily')
 where exists (select 1 from cron.job where jobname = 'ai-course-monitor-daily');

-- 毎日 00:00 UTC = 日本時間 9:00。
-- ライフサイクルメール（01:30 UTC）より前に走らせる＝朝いちばんに異常を拾い、
-- 「壊れたまま学習者へメールを送る」順序を避ける。
select cron.schedule(
  'ai-course-monitor-daily',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://jdkwijdphlkrcoiggfqw.supabase.co/functions/v1/ai-course-monitor',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets where name = 'reminder_cron_secret'
      )
    ),
    body := '{"source":"pg_cron"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

-- 確認: select jobid, jobname, schedule, active from cron.job;
