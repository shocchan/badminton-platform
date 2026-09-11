-- ROLLBACK: 20260911160000_signup_grant_wechat.sql
-- 列は残す（預かった連絡先を消さない）。管理者用の関数だけ消す。
drop function if exists public.ai_admin_signup_contacts();
-- 列まで消す場合だけ（預かった WeChat ID も消える）:
-- alter table public.ai_course_signup_grants drop column if exists wechat_id;
