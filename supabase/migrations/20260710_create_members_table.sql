-- ===================================================
-- members テーブル作成（新規登録ユーザー管理）
-- SignupPage で auth.signUp() 後、このテーブルに INSERT される
-- ===================================================

CREATE TABLE IF NOT EXISTS members (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  charge_balance INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- member_number は管理者が手動で設定する（または後でALTER TABLEで追加可）
ALTER TABLE members ADD COLUMN IF NOT EXISTS member_number INT UNIQUE;

-- RLS 有効化
ALTER TABLE members ENABLE ROW LEVEL SECURITY;

-- 管理者は全操作可（CRUD）
CREATE POLICY "admins can manage members" ON members
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 認証ユーザーは自分のレコードだけ SELECT 可（将来の MyPage 連携用）
CREATE POLICY "users can view own member record" ON members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- anon は SELECT 不可（セキュリティ）
-- デフォルトで deny なので明示的なポリシー不要

GRANT SELECT, INSERT, UPDATE, DELETE ON members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON members TO service_role;
