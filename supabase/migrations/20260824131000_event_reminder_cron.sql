-- 開催前日リマインドの毎日自動実行（2026-08-24）
--
-- なぜ要るか: 大会エントリー22件のうち15件が cancelled（68%）。開催日を起点にした
-- 自動送信は1本も無かった。前日に一度だけ「日時・会場・持ち物・やめるときの導線」を渡す。
--
-- 認可は x-cron-secret のみ（lifecycle / monitor と同じ vault の 'reminder_cron_secret'）。
-- **この cron を有効にする前に、関数を --no-verify-jwt でデプロイしておくこと。**
--
-- ⚠️ 適用＝実送信の開始。先に MAIL_DRY_RUN=true を立てた状態で
--    supabase secrets set MAIL_DRY_RUN=true
--    curl -X POST .../functions/v1/event-reminder -H "x-cron-secret: …" -d '{"dryRun":true}'
--    で「誰に・どの開催回が送られるはずか」を目視してから外すこと。

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('event-reminder-daily')
 where exists (select 1 from cron.job where jobname = 'event-reminder-daily');

-- 毎日 09:00 UTC = 日本時間 18:00。
-- 前日の夕方に届く＝仕事終わりに読めて、行けないと分かったその晩にキャンセルできる。
-- 監視（00:00 UTC）・購入後フォロー（01:30 UTC）とも時間帯が重ならない。
select cron.schedule(
  'event-reminder-daily',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://jdkwijdphlkrcoiggfqw.supabase.co/functions/v1/event-reminder',
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

-- 確認:
--   select jobid, jobname, schedule, active from cron.job;
--   select * from public.ai_mail_health();
--   select job, started_at, finished_at, sent, failed from public.mail_job_runs order by started_at desc limit 10;
