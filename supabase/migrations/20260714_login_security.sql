-- ログインセキュリティ: 試行回数ロック + 管理者メールOTP（2FA）
-- どちらも login-guard Edge Function（service_role）専用。anon には触らせない。

-- 1. ログイン試行の追跡（メール単位でロック）
CREATE TABLE IF NOT EXISTS login_attempts (
  email         text PRIMARY KEY,
  fail_count    int NOT NULL DEFAULT 0,
  first_fail_at timestamptz NOT NULL DEFAULT now(),
  locked_until  timestamptz,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 2. 管理者メールOTPチャレンジ（パスワード成功後、コード検証まで token を保持）
CREATE TABLE IF NOT EXISTS admin_login_challenges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  email       text NOT NULL,
  code_hash   text NOT NULL,          -- 6桁コードの SHA-256（平文は保存しない）
  session     jsonb NOT NULL,          -- 検証成功後に返す access/refresh token
  attempts    int NOT NULL DEFAULT 0,  -- コード誤入力回数
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_login_challenges_expires ON admin_login_challenges (expires_at);

-- RLS: 両テーブルとも service_role のみ。anon/authenticated からは一切読めない
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_login_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON login_attempts FROM anon, authenticated;
REVOKE ALL ON admin_login_challenges FROM anon, authenticated;
GRANT ALL ON login_attempts TO service_role;
GRANT ALL ON admin_login_challenges TO service_role;
