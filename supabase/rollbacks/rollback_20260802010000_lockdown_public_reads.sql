-- ===================================================
-- 20260802010000_lockdown_public_reads.sql の巻き戻し
--
-- ⚠️ これを実行すると、公開anonキーで以下が再び読めるようになる:
--    entries の氏名・電話・メール・cancel_token / activity_entries の cancel_code /
--    members / groups.admin_password
-- 使うのは「フェーズ2のフロントに問題があり、旧フロントへ戻す必要がある場合」だけ。
-- 戻したあとは必ず原因を直して再度 lockdown を適用すること。
-- ===================================================

-- 1) entries の公開SELECTを復活
CREATE POLICY "entries_select_anon" ON entries
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "entries_select_public" ON entries
  FOR SELECT USING (true);

-- 2) members の公開SELECTを復活
CREATE POLICY "anon can read members" ON members
  FOR SELECT TO anon USING (true);

-- 3) groups の公開SELECTを復活
CREATE POLICY "Groups are viewable by everyone" ON groups
  FOR SELECT USING (true);

-- 4) activity_entries を元の権限に戻す
DROP POLICY IF EXISTS "admins can manage activity_entries" ON activity_entries;
CREATE POLICY "Authenticated users can manage entries" ON activity_entries
  FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY "Anon can delete entries" ON activity_entries
  FOR DELETE TO anon USING (true);
CREATE POLICY "Anon can update entries" ON activity_entries
  FOR UPDATE TO anon USING (true);

-- 列単位のGRANTを解除し、テーブル全体のSELECTに戻す
REVOKE SELECT (id, activity_id, name, member_type, source, quantity, created_at, status, notes)
  ON activity_entries FROM anon, authenticated;
GRANT SELECT ON activity_entries TO anon, authenticated;
GRANT DELETE, UPDATE ON activity_entries TO anon;

-- 5)6) TRUNCATE や不要な書き込み権限は復活させない。
-- これらは復活させる理由が無く、戻すとセキュリティが下がるだけなので意図的に対象外。
