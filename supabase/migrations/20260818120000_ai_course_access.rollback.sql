-- rollback: 受講権テーブルを撤去（データも消えるので実行前に必ずバックアップ）
drop table if exists public.ai_course_access;
