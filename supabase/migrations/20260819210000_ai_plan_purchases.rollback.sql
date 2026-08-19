-- 20260819210000_ai_plan_purchases.sql のロールバック。
-- ⚠️ 台帳には購入の事実記録が入る。実購入が1件でも入ったあとは
--    dropではなくバックアップ取得を先に行うこと。
drop function if exists public.ai_admin_list_purchases();
drop table if exists public.ai_plan_purchases;
