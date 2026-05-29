-- ========================================
-- entries テーブルの権限・RLS修正
-- ========================================

-- anon / authenticated への GRANT
GRANT SELECT, INSERT ON TABLE public.entries TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.entries_id_seq TO anon, authenticated;

-- RLS 有効化（すでに有効なら無視される）
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーをいったんクリア
DROP POLICY IF EXISTS "Allow insert for all" ON public.entries;
DROP POLICY IF EXISTS "Allow select for all" ON public.entries;
DROP POLICY IF EXISTS "Allow select for authenticated" ON public.entries;

-- 一般ユーザー（anon）は INSERT のみ可
CREATE POLICY "Allow insert for all"
  ON public.entries FOR INSERT
  WITH CHECK (true);

-- 管理者（authenticated）は SELECT も可
CREATE POLICY "Allow select for authenticated"
  ON public.entries FOR SELECT
  TO authenticated
  USING (true);
