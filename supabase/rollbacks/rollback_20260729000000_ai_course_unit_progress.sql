-- feature rollback: 単元進捗テーブル・RPCのみ撤去する。
-- security rollback（RLS/grants/trigger全般）とは混ぜない（rollback-backup.md の分離原則）。
drop function if exists public.ai_upsert_unit_progress(uuid, text, jsonb, int, text);
drop table if exists public.ai_course_unit_progress;
