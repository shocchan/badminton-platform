-- 20260825110000_blog_zh_columns.sql の巻き戻し（適用は人間の判断で）
--
-- ⚠️ この3列には**人が検品した翻訳**が入る。drop すると訳文は消える。
--    翻訳の原本は scripts/blog/zh/<id>.zh.json に残しているので作り直せるが、
--    その後に管理画面から手で直した分は復元できない。
--    実行前に必ずバックアップを取ること:
--      select id, title_zh, excerpt_zh, content_zh from public.blog_posts
--      where content_zh is not null;
--
-- 画面側（src/pages/BlogPage.tsx・BlogDetailPage.tsx）は列が無くても動くが、
-- useBlogPosts が select('*') なので、列を消す前にフロントを戻す必要は無い。

drop index if exists public.idx_blog_posts_translated_zh;

alter table public.blog_posts
  drop column if exists content_zh,
  drop column if exists excerpt_zh,
  drop column if exists title_zh;
