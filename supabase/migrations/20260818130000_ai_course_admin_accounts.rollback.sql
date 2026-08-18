-- 20260818130000_ai_course_admin_accounts.sql の巻き戻し
drop function if exists public.ai_admin_list_accounts();

alter table public.ai_course_access
  drop column if exists plan_id,
  drop column if exists plan_version,
  drop column if exists source,
  drop column if exists ai_seconds_limit,
  drop column if exists purchase_id;

-- 埋め戻しの巻き戻し（適用前は全アカウント is_test=false だったことを 2026-08-18 に実測確認済み）
update public.ai_learners l
set is_test = false
from auth.users u
where l.user_id = u.id
  and u.email in (
    'test@id.badminton-platform.pages.dev',
    'kaiwa@id.badminton-platform.pages.dev',
    'jlpt@id.badminton-platform.pages.dev',
    'qa-temporary-1786940477761@kawabado-stage-verify.invalid'
  );

update public.ai_course_signup_grants
set is_test = false
where email in (
    'test@id.badminton-platform.pages.dev',
    'kaiwa@id.badminton-platform.pages.dev',
    'jlpt@id.badminton-platform.pages.dev',
    'qa-temporary-1786940477761@kawabado-stage-verify.invalid'
  );
