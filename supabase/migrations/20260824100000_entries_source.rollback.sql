-- 20260824100000_entries_source.sql の巻き戻し（適用は人間の判断で）
--
-- ⚠️ この列には「どこから来た申込か」という取り直せない事実が入る。
--    drop すると過去分は復元できない。実行前に必ず entries のバックアップを取ること。

drop index if exists public.idx_entries_source;
alter table public.entries drop column if exists source;
