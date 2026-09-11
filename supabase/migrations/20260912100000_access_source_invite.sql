-- 受講権の source に 'invite' を認める（2026-09-12）。
--
-- 招待からの登録（ai-course-invite-signup／ai_provision_access_from_grant）は source='invite' で
-- 受講権を作るが、CHECK が manual / purchase / test しか認めておらず、静かに失敗していた
-- （トリガーは例外を握りつぶす設計。CEO 実機で「コースが開通していません」）。
-- 追加だけ。既存の行は書き換えない。
alter table public.ai_course_access drop constraint if exists ai_course_access_source_check;
alter table public.ai_course_access
  add constraint ai_course_access_source_check
  check (source = any (array['manual'::text, 'purchase'::text, 'test'::text, 'invite'::text]));
