-- ===================================================
-- 公開読み取り・匿名書き込みの封鎖（2026-08-02）
-- 【フェーズ3／3】⚠️ フロントを先に本番反映してから実行すること。
--
--   フェーズ1: 20260802000000_privacy_rpcs.sql を適用（済）
--   フェーズ2: フロントをRPC利用へ切り替え → staging確認 → 本番反映
--   フェーズ3: このファイルを実行
--
-- 順番を間違えると申込フォーム・キャンセル・大会の残り枠表示が壊れる。
-- 巻き戻しは supabase/rollbacks/20260802_lockdown_rollback.sql
-- ===================================================

-- ── 1) entries: 氏名・電話・メール・cancel_token の公開読み取りを廃止 ──
-- 残り枠は get_tournament_entry_count(s)、重複チェックは find_entry_for_resume、
-- マイページは get_my_entries を使う。管理者用の SELECT（is_admin()）は残す。
DROP POLICY IF EXISTS "entries_select_anon" ON entries;
DROP POLICY IF EXISTS "entries_select_public" ON entries;

-- ── 2) members: 公開読み取りを廃止 ──
-- クライアントからの参照は無い（登録時のINSERTと管理画面のみ）ので影響なし。
DROP POLICY IF EXISTS "anon can read members" ON members;

-- ── 3) groups: admin_password が読めていた公開SELECTを廃止 ──
-- 画面が使うのは get_group_info / get_group_id の2つのRPCのみ（パスワードを返さない）。
DROP POLICY IF EXISTS "Groups are viewable by everyone" ON groups;

-- ── 4) activity_entries ──
-- 参加者名の一覧表示は仕様（公開の申込一覧）なので SELECT 自体は残す。
-- ただし cancel_code は列単位で隠す。画面に出ている氏名＋コードが揃うと
-- 誰でも他人の申込を取り消せてしまうため。
DROP POLICY IF EXISTS "Anon can delete entries" ON activity_entries;
DROP POLICY IF EXISTS "Anon can update entries" ON activity_entries;

-- 「ログイン済みなら何でもできる」を管理者限定にする
-- （バド対決ゲームで一般ユーザーの会員登録が始まっており authenticated ≠ 管理者）
DROP POLICY IF EXISTS "Authenticated users can manage entries" ON activity_entries;
CREATE POLICY "admins can manage activity_entries" ON activity_entries
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- cancel_code を列単位で非公開にする。
-- ※ PostgREST の select('*') は全列を要求するため、フロント側は明示的な列指定が必須。
--    （ActivityPage / AdminPage / MyPage は対応済み）
REVOKE SELECT ON activity_entries FROM anon, authenticated;
GRANT SELECT (id, activity_id, name, member_type, source, quantity, created_at, status, notes)
  ON activity_entries TO anon, authenticated;

-- キャンセルは cancel_activity_entry RPC 経由のみにする
REVOKE DELETE, UPDATE ON activity_entries FROM anon;

-- ── 5) 不要な TRUNCATE 権限を剥奪 ──
-- TRUNCATE は RLS を無視するため、付いているべきではない。
-- （2026-07-13 に site_admins だけ実施済み。残り全テーブルへ広げる）
REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- ── 6) RLSで止まってはいるが不要な書き込み権限を剥奪（多層防御） ──
REVOKE DELETE, UPDATE ON activities FROM anon;
REVOKE DELETE, UPDATE, INSERT ON blog_posts FROM anon;
REVOKE DELETE, UPDATE ON tournaments FROM anon;
REVOKE UPDATE ON members FROM anon;
