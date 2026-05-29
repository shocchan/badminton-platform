-- ============================================================
-- ブログ保存 & 画像アップロード修正
-- Supabase Dashboard → SQL Editor で実行してください
-- ============================================================

-- 1. blog_posts の INSERT/UPDATE/DELETE ポリシーを追加
--    （認証済みユーザー = 管理者のみ操作可能）
CREATE POLICY "blog_posts_insert_auth"
  ON blog_posts FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "blog_posts_update_auth"
  ON blog_posts FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "blog_posts_delete_auth"
  ON blog_posts FOR DELETE TO authenticated
  USING (true);

-- 2. tournaments の INSERT/UPDATE/DELETE ポリシーを追加
--    （まだ設定されていない場合のみ実行）
CREATE POLICY "tournaments_insert_auth"
  ON tournaments FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "tournaments_update_auth"
  ON tournaments FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "tournaments_delete_auth"
  ON tournaments FOR DELETE TO authenticated
  USING (true);

-- 3. Supabase Storage: blog-images バケットを作成
--    （Dashboard → Storage → New bucket でも作成可能）
INSERT INTO storage.buckets (id, name, public)
VALUES ('blog-images', 'blog-images', true)
ON CONFLICT (id) DO NOTHING;

-- 4. Storage ポリシー: 公開読み取り
CREATE POLICY "blog_images_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'blog-images');

-- 5. Storage ポリシー: 認証済みユーザーのアップロード
CREATE POLICY "blog_images_insert_auth"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'blog-images');

-- 6. Storage ポリシー: 認証済みユーザーの削除
CREATE POLICY "blog_images_delete_auth"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'blog-images');
