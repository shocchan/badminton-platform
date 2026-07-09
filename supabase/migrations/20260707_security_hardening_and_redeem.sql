-- ===================================================
-- セキュリティ強化 + クーポン消込RPC（2026-07-07）
--
-- 背景: バド対決ゲームで一般ユーザーの会員登録が始まったため、
-- 「authenticated＝管理者」前提のRLSポリシーと、無防備なSECURITY DEFINER RPC、
-- activitiesへのanon直接書き込みを全て封じる。
--
-- 管理者は site_admins テーブル（allowlist）で管理。
-- サブグループ管理者（chaoxianzu等）はRPCにグループパスワードを渡す方式に変更。
-- ===================================================

-- ── 1) 管理者allowlist + is_admin() ──

CREATE TABLE IF NOT EXISTS site_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE site_admins ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.site_admins TO service_role;

INSERT INTO site_admins (user_id, note)
SELECT id, 'CEO' FROM auth.users WHERE email = 'shodorannga@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM site_admins WHERE user_id = auth.uid()) $$;
GRANT EXECUTE ON FUNCTION is_admin() TO anon, authenticated;

-- グループ管理者チェック（本管理者 or グループパスワード一致）
CREATE OR REPLACE FUNCTION assert_group_admin(p_group_slug TEXT, p_password TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF is_admin() THEN RETURN; END IF;
  IF p_password IS NOT NULL AND check_group_password(p_group_slug, p_password) THEN RETURN; END IF;
  RAISE EXCEPTION 'forbidden';
END $$;

-- ── 2) activities: anon直接書き込みを全廃、管理者のみに ──

DROP POLICY IF EXISTS "Anon can delete activities" ON activities;
DROP POLICY IF EXISTS "Anon can insert activities" ON activities;
DROP POLICY IF EXISTS "Anon can update activities" ON activities;
DROP POLICY IF EXISTS "Authenticated users can manage activities" ON activities;
CREATE POLICY "admins can manage activities" ON activities
  FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- ── 3) activity系RPC: パスワード必須化（本管理者はパス不要） ──

DROP FUNCTION IF EXISTS admin_upsert_activity(text,uuid,text,date,time,time,text,integer,integer,text,text,text);
CREATE OR REPLACE FUNCTION admin_upsert_activity(
  p_group_slug TEXT, p_edit_id UUID DEFAULT NULL, p_title TEXT DEFAULT '',
  p_date DATE DEFAULT NULL, p_start_time TIME DEFAULT '17:00', p_end_time TIME DEFAULT '19:00',
  p_location TEXT DEFAULT '', p_capacity INT DEFAULT 16, p_price INT DEFAULT 0,
  p_status TEXT DEFAULT 'open', p_address TEXT DEFAULT '', p_notes TEXT DEFAULT '',
  p_password TEXT DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_group_id UUID; v_id UUID;
BEGIN
  PERFORM assert_group_admin(p_group_slug, p_password);
  SELECT id INTO v_group_id FROM groups WHERE slug = p_group_slug;
  IF p_edit_id IS NOT NULL THEN
    UPDATE activities SET title=p_title, date=p_date, start_time=p_start_time,
      end_time=p_end_time, location=p_location, capacity=p_capacity, price=p_price,
      status=p_status, address=p_address, notes=p_notes
    WHERE id=p_edit_id AND group_id=v_group_id RETURNING id INTO v_id;
  ELSE
    INSERT INTO activities (title,date,start_time,end_time,location,capacity,price,status,address,notes,group_id)
    VALUES (p_title,p_date,p_start_time,p_end_time,p_location,p_capacity,p_price,p_status,p_address,p_notes,v_group_id)
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

DROP FUNCTION IF EXISTS admin_archive_activity(uuid,text);
CREATE OR REPLACE FUNCTION admin_archive_activity(p_id UUID, p_group_slug TEXT, p_password TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM assert_group_admin(p_group_slug, p_password);
  UPDATE activities SET archived_at=now()
  WHERE id=p_id AND group_id=(SELECT id FROM groups WHERE slug=p_group_slug);
END $$;

DROP FUNCTION IF EXISTS admin_unarchive_activity(uuid,text);
CREATE OR REPLACE FUNCTION admin_unarchive_activity(p_id UUID, p_group_slug TEXT, p_password TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM assert_group_admin(p_group_slug, p_password);
  UPDATE activities SET archived_at=null
  WHERE id=p_id AND group_id=(SELECT id FROM groups WHERE slug=p_group_slug);
END $$;

DROP FUNCTION IF EXISTS admin_delete_activity(uuid,text);
CREATE OR REPLACE FUNCTION admin_delete_activity(p_id UUID, p_group_slug TEXT, p_password TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM assert_group_admin(p_group_slug, p_password);
  DELETE FROM activity_entries WHERE activity_id=p_id;
  DELETE FROM activities WHERE id=p_id AND group_id=(SELECT id FROM groups WHERE slug=p_group_slug);
END $$;

-- ── 4) 「authenticated＝管理者」前提だったポリシーを is_admin() に置換 ──

-- blog_posts
DROP POLICY IF EXISTS "Allow insert for authenticated" ON blog_posts;
DROP POLICY IF EXISTS "Allow update for authenticated" ON blog_posts;
DROP POLICY IF EXISTS "Allow delete for authenticated" ON blog_posts;
CREATE POLICY "admins can insert blog_posts" ON blog_posts FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "admins can update blog_posts" ON blog_posts FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "admins can delete blog_posts" ON blog_posts FOR DELETE TO authenticated USING (is_admin());

-- tournaments
DROP POLICY IF EXISTS "tournaments_insert_authenticated" ON tournaments;
DROP POLICY IF EXISTS "tournaments_update_authenticated" ON tournaments;
DROP POLICY IF EXISTS "tournaments_delete_authenticated" ON tournaments;
CREATE POLICY "admins can insert tournaments" ON tournaments FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "admins can update tournaments" ON tournaments FOR UPDATE TO authenticated USING (is_admin());
CREATE POLICY "admins can delete tournaments" ON tournaments FOR DELETE TO authenticated USING (is_admin());

-- contacts（問い合わせ: 個人情報。閲覧・更新は管理者のみ、送信は誰でも）
DROP POLICY IF EXISTS "authenticated can read contacts" ON contacts;
DROP POLICY IF EXISTS "authenticated can update contacts" ON contacts;
CREATE POLICY "admins can read contacts" ON contacts FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admins can update contacts" ON contacts FOR UPDATE TO authenticated USING (is_admin());

-- entries（大会申込: 認証ユーザー向けの全件閲覧・更新は管理者のみに）
DROP POLICY IF EXISTS "Allow select for authenticated" ON entries;
DROP POLICY IF EXISTS "authenticated users can update entries" ON entries;
CREATE POLICY "admins can select entries" ON entries FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admins can update entries" ON entries FOR UPDATE TO authenticated USING (is_admin());

-- subscribers（メール購読者リスト）
DROP POLICY IF EXISTS "select_auth" ON subscribers;
CREATE POLICY "admins can select subscribers" ON subscribers FOR SELECT TO authenticated USING (is_admin());

-- shuttle_counter / shuttle_retirement_log
DROP POLICY IF EXISTS "auth users can update counter" ON shuttle_counter;
DROP POLICY IF EXISTS "shuttle_counter_admin_update" ON shuttle_counter;
CREATE POLICY "admins can update shuttle_counter" ON shuttle_counter FOR UPDATE TO authenticated USING (is_admin());
DROP POLICY IF EXISTS "auth users can delete logs" ON shuttle_retirement_log;
DROP POLICY IF EXISTS "shuttle_log_admin_delete" ON shuttle_retirement_log;
DROP POLICY IF EXISTS "shuttle_log_admin_insert" ON shuttle_retirement_log;
CREATE POLICY "admins can insert shuttle_log" ON shuttle_retirement_log FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "admins can delete shuttle_log" ON shuttle_retirement_log FOR DELETE TO authenticated USING (is_admin());

-- ── 5) クーポン消込RPC（管理者専用） ──

CREATE OR REPLACE FUNCTION admin_find_coupon(p_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r JSONB;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'id', c.id, 'type', c.type, 'status', c.status,
    'issued_at', c.issued_at, 'used_at', c.used_at,
    'owner', COALESCE(u.raw_user_meta_data->>'nickname', u.email, '(未登録ゲスト)')
  ) INTO r
  FROM coupons c
  LEFT JOIN auth.users u ON u.id = c.user_id
  WHERE c.id::text ILIKE lower(p_code) || '%'
  LIMIT 1;
  RETURN r; -- 見つからなければ NULL
END $$;
GRANT EXECUTE ON FUNCTION admin_find_coupon(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION admin_redeem_coupon(p_coupon_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE coupons SET status = 'used', used_at = now()
  WHERE id = p_coupon_id AND status IN ('claimed', 'reserved');
  RETURN FOUND;
END $$;
GRANT EXECUTE ON FUNCTION admin_redeem_coupon(UUID) TO authenticated;
