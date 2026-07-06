-- ===================================================
-- 問い合わせフォーム（/contact）用 contacts テーブル
-- Supabaseダッシュボード > SQL Editor で実行する
-- ===================================================

CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('activity', 'tournament', 'sponsor', 'other')),
  message TEXT NOT NULL,
  lang TEXT NOT NULL DEFAULT 'ja',
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'replied', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_created_at ON contacts(created_at DESC);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- 誰でも送信（INSERT）できるが、読み取り・更新は管理者（認証ユーザー）のみ
CREATE POLICY "anon can insert contacts" ON contacts
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "authenticated can read contacts" ON contacts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "authenticated can update contacts" ON contacts
  FOR UPDATE TO authenticated USING (true);
