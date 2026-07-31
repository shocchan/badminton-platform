-- rollback（20260728000000_ai_course_vocab_persistence の取り消し・未適用の草案）
-- learnerデータを含むため、実行前に必ず ai_course_vocab_* 3表のdumpを取得すること。
drop trigger if exists ai_course_vocab_item_progress_touch on public.ai_course_vocab_item_progress;
drop trigger if exists ai_course_vocab_pack_progress_touch on public.ai_course_vocab_pack_progress;
drop trigger if exists ai_course_vocab_diagnostic_attempts_touch on public.ai_course_vocab_diagnostic_attempts;
drop function if exists public.ai_course_vocab_touch();
drop table if exists public.ai_course_vocab_diagnostic_attempts;
drop table if exists public.ai_course_vocab_pack_progress;
drop table if exists public.ai_course_vocab_item_progress;
