-- ai_course_alerts の巻き戻し（適用は人間の判断で）
-- 監視のしきい値も消す。学習データ・購入台帳には一切触れない。
drop function if exists public.ai_monitor_cron_health();
drop function if exists public.ai_admin_resolve_alert(uuid, boolean);
drop table if exists public.ai_course_alerts;
delete from public.ai_config where key = 'monitoring';
