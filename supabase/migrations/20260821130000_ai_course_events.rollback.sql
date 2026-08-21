-- ai_course_events の巻き戻し（適用は人間の判断で）
drop function if exists public.ai_log_course_event(text, jsonb);
drop table if exists public.ai_course_events;
