-- ロールバック（草案・未適用のmigrationに対応）。データごと削除するため適用後の実行はCEO承認必須。
drop table if exists public.ai_course_foundation_review_queue;
drop table if exists public.ai_course_foundation_question_attempts;
drop table if exists public.ai_course_foundation_item_progress;
drop table if exists public.ai_course_foundation_unit_attempts;
