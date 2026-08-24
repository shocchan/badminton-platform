-- 開催前日リマインドの定期実行を止める（適用は人間の判断で）
-- 送信ログ（ai_course_mail_log の scope='event'）は消さない。
-- 消すと「誰に送ったか」が分からなくなり、再開したときに二重送信になる。
select cron.unschedule('event-reminder-daily')
 where exists (select 1 from cron.job where jobname = 'event-reminder-daily');
