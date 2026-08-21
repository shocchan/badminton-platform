-- ai_content_reviews の巻き戻し（適用は人間の判断で）
-- ⚠️ CEOのレビュー結果がすべて消えます。実行前に必ずバックアップを取ること。
drop function if exists public.ai_admin_content_review_history(text, text);
drop function if exists public.ai_admin_set_content_review(text, text, text, text);
drop function if exists public.ai_admin_list_content_reviews();
drop table if exists public.ai_content_reviews;
