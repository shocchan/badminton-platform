-- 20260803000000_ai_course_sales.sql の切り戻し。
--
-- 注意: 購入・利用権の記録が消える。**返金や問い合わせの調査ができなくなる**ので、
-- 実行前に必ず ai_plan_purchases / ai_plan_entitlements を CSV へ退避すること。
--
--   \copy public.ai_plan_purchases    to 'purchases_backup.csv'    csv header
--   \copy public.ai_plan_entitlements to 'entitlements_backup.csv' csv header
--   \copy public.ai_plan_consumption  to 'consumption_backup.csv'  csv header

drop function if exists public.ai_plan_consume(uuid, integer, integer, integer);

drop table if exists public.ai_plan_support_events;
drop table if exists public.ai_plan_consultations;
drop table if exists public.ai_plan_upsell_impressions;
drop table if exists public.ai_plan_usage_window;
drop table if exists public.ai_plan_consumption;
-- entitlements は purchases を参照しているので先に落とす
drop table if exists public.ai_plan_entitlements;
drop table if exists public.ai_plan_purchases;
