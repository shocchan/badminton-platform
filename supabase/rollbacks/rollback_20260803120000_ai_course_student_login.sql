-- 20260803120000_ai_course_student_login.sql の切り戻し。
--
-- 影響: 生徒のログインID対応と試行ログが消える。
-- **Supabase Auth のユーザー本体は消えない**ので、学習履歴・利用権は残る。
-- ログインIDを作り直せば同じ学習者として再開できる。

drop function if exists public.ai_course_prune_login_attempts();
drop table if exists public.ai_course_login_attempts;
drop table if exists public.ai_course_logins;
