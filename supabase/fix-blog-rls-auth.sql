-- ========================================
-- blog_posts RLS: 書き込みを authenticated のみに制限
-- ========================================

-- 既存の書き込みポリシーを削除
DROP POLICY IF EXISTS "Allow insert for all" ON public.blog_posts;
DROP POLICY IF EXISTS "Allow update for all" ON public.blog_posts;
DROP POLICY IF EXISTS "Allow delete for all" ON public.blog_posts;

-- 読み取りは引き続き全員OK（公開ページ用）
DROP POLICY IF EXISTS "Allow select for all" ON public.blog_posts;
CREATE POLICY "Allow select for all"
  ON public.blog_posts FOR SELECT
  USING (true);

-- 書き込みは Supabase Auth でログイン済みのユーザーのみ
CREATE POLICY "Allow insert for authenticated"
  ON public.blog_posts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow update for authenticated"
  ON public.blog_posts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete for authenticated"
  ON public.blog_posts FOR DELETE
  TO authenticated
  USING (true);

-- storage の blog-images バケットも同様に制限
DROP POLICY IF EXISTS "Allow anon insert to blog-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon delete from blog-images" ON storage.objects;

CREATE POLICY "Allow authenticated insert to blog-images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'blog-images');

CREATE POLICY "Allow authenticated delete from blog-images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'blog-images');
