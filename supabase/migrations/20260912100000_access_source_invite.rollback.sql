-- ROLLBACK: 20260912100000_access_source_invite.sql
-- source='invite' の行が残っていると戻せない（先に 'manual' へ書き換えるか、行を消す）
alter table public.ai_course_access drop constraint if exists ai_course_access_source_check;
alter table public.ai_course_access
  add constraint ai_course_access_source_check
  check (source = any (array['manual'::text, 'purchase'::text, 'test'::text]));
