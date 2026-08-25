-- ブログ記事に中国語本文を持たせる（2026-08-25）
--
-- CEO指示: 「右上の言語変更したときに、ブログ文章も中国語に切り替わるように」
--
-- 【なぜ別記事にしないか】
-- 「中国語版を別の記事として立てる」案は採らない。同じ記事が2行に割れると
--   - view_count が2つに分かれ、人気順の並べ替え（src/pages/BlogPage.tsx）が壊れる
--   - /ja/blog/9 と /zh/blog/40 が別URLになり、共有されたリンクの言語が固定される
--   - 片方だけ編集される（必ず起きる。既に staticSeo.json で同じ事故を防ぐテストを書いている）
-- 同じ行・同じ id のまま、表示する列を言語で切り替える。
--
-- 【NULL の意味】
-- NULL / 空文字 = 未翻訳。未翻訳の記事は中国語UIでも**日本語のまま出す**（画面側で「日文」バッジ）。
-- 訳し終わった記事だけを一覧に出す案は採らない。中国語で見たときに記事が3本しか無いと
-- 「更新が止まったサイト」に見えるため。全部並べて、訳が無いものはその旨を示す。
--
-- 【RLS】
-- 変更不要。SELECT ポリシー blog_posts_select_non_draft_or_admin の USING は
--   ((status IS DISTINCT FROM 'draft') OR is_admin())
-- で列を絞っていない（本番で確認済み）。列単位のACL（pg_attribute.attacl）も空で、
-- anon の SELECT はテーブル単位の GRANT なので、列を足せばそのまま読める。
-- UPDATE は authenticated かつ is_admin() のみ、anon は 20260802010000 で REVOKE 済み。

alter table public.blog_posts
  add column if not exists title_zh text,
  add column if not exists excerpt_zh text,
  add column if not exists content_zh text;

comment on column public.blog_posts.title_zh is
  '中国語タイトル。NULL/空 = 未翻訳（中国語UIでも日本語タイトルを出し「日文」バッジを付ける）。';
comment on column public.blog_posts.excerpt_zh is
  '中国語の抜粋。NULL/空 = 未翻訳。一覧カードと meta description に使う。';
comment on column public.blog_posts.content_zh is
  '中国語本文。content と**同じHTML骨格**を保つこと（タグ・href・iframe属性は日本語版と同一）。'
  ' 生成は scripts/blog/export-zh-todo.mjs → scripts/blog/apply-zh.mjs（テキストノードだけを訳す）。'
  ' 固有名詞（芝園公民館・蕨市民体育館・川口・蕨バド交流杯・kawabado・ばりかた屋・人名）は日本語のまま残す。';

-- 「中国語版がある記事」を数える／sitemap で絞るための索引。
-- 未翻訳（NULL・空文字）は入れないので、記事が増えても索引は訳済みの本数しか持たない。
create index if not exists idx_blog_posts_translated_zh
  on public.blog_posts (id)
  where content_zh is not null and content_zh <> '';
