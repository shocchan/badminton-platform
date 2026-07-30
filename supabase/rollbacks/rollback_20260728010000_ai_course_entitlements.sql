-- rollback for 20260728010000_ai_course_entitlements.sql
-- 撤去順: trigger → function → table（依存順）。
-- 注意: これはfeature rollback。移行insertで作られた行もtableごと消える。
--       実行前に `select * from public.ai_course_entitlements;` のdumpを取得すること。
drop trigger if exists ai_learners_protect_admin_overrides on public.ai_learners;
drop function if exists public.ai_course_protect_admin_overrides();
drop table if exists public.ai_course_entitlements;
