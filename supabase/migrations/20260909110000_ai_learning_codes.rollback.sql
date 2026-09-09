-- rollback: 20260909110000_ai_learning_codes.sql
--
-- 学習コードでのログインができなくなるだけで、アカウント（auth.users）と学習記録には触れない。
-- ID＋パスワードの経路は元から独立しているので、戻しても誰も締め出されない。

drop function if exists public.ai_admin_learning_codes();
drop function if exists public.ai_code_login_record(text, boolean, text);
drop function if exists public.ai_code_login_throttle(text);
drop function if exists public.ai_resolve_learning_code(text);
drop function if exists public.ai_admin_revoke_learning_code(uuid, text);
drop function if exists public.ai_admin_issue_learning_code(uuid, text, boolean);
drop function if exists public.ai_normalize_learning_code(text);
drop function if exists public.ai_generate_learning_code();

drop table if exists public.ai_code_login_attempts;
drop table if exists public.ai_learning_codes;
