-- 監視の定期実行を止める（適用は人間の判断で）。
-- 止めるとアラートの自動検知とメール通知が動かなくなる。関数とテーブルは残るので、
-- 手動で net.http_post を叩けば検知はできる（operations-runbook.md 2章）。
select cron.unschedule('ai-course-monitor-daily')
 where exists (select 1 from cron.job where jobname = 'ai-course-monitor-daily');
