-- ===================================================
-- subscribers テーブルの RLS 有効化漏れを修正（2026-07-08）
--
-- 20260707のセキュリティ強化時、subscribers だけ ENABLE ROW LEVEL SECURITY を
-- 打ち忘れており、Supabaseのセキュリティスキャンで「Table publicly accessible
-- (rls_disabled_in_public)」として警告された。RLSを有効化し、管理者の
-- UPDATE/DELETEポリシーを補う。
--
-- 検証済み: anon は INSERT(登録)のみ可・SELECT/UPDATE/DELETE不可、
-- 管理者(site_admins)は全操作可。
-- ===================================================

ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

-- 既存: "insert_anon"(anon INSERT), "admins can select subscribers"(authenticated SELECT)
-- 不足していた管理者の編集・削除ポリシーを追加
DROP POLICY IF EXISTS "admins can update subscribers" ON subscribers;
DROP POLICY IF EXISTS "admins can delete subscribers" ON subscribers;
CREATE POLICY "admins can update subscribers" ON subscribers
  FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "admins can delete subscribers" ON subscribers
  FOR DELETE TO authenticated USING (is_admin());
