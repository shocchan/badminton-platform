-- ===================================================
-- 管理画面を実務で使える状態にする（2026-08-24）
--
-- 目的は2つ。どちらも「管理者しか触れない経路」を先に用意することが本体で、
-- 画面はそのあとに乗せる。
--
--   (1) 大会エントリーの入金確認を、管理者だけが記録できる経路を作る
--   (2) 問い合わせ（contacts）を、管理者だけが読める状態に直したうえで
--       管理画面から一覧・既読化できるようにする
--
-- 【なぜ process-admin Edge Function を使わないか】
--   既存の管理者操作の一部は process-admin 経由だが、この関数には認証・認可が無い
--   ことが監査で判明している（誰でも叩ける）。入金の記録＝お金に関わる状態変更を
--   そこに増やさない。ここでは is_admin() ガード付きのRPCに閉じる。
--
-- 【なぜ contacts の権限を締めるか】
--   20260706_contacts.sql の SELECT/UPDATE ポリシーは `TO authenticated USING (true)`。
--   バド対決ゲームで一般ユーザーの会員登録が始まっており authenticated ≠ 管理者
--   （2026-08-02 の封鎖と同じ穴）。いまは問い合わせの氏名・メール・本文を
--   ログイン済みなら誰でも読める。これを is_admin() に締める。
--
-- 巻き戻し: 20260824120000_admin_ops_payment_and_contacts.rollback.sql
-- ===================================================

-- ── 1) 入金確認: 管理者限定RPC ──────────────────────────────
--
-- 未入金の自動督促（payment-reminder / pg_cron・毎日10:00 JST・稼働中）は
--   status='confirmed'（またはNULL） × tournaments.payment_required × payment_status <> 'completed'
-- を対象にしている。「管理画面で入金確認を押すと督促が止まる」を成立させるため、
-- ここで書く列と値は督促側とまったく同じものにする（payment_status='completed'）。
--
-- クレジット決済分は Stripe の記録と紐づくため、手動での付け外しを禁止する。
CREATE OR REPLACE FUNCTION admin_set_entry_payment(p_entry_id BIGINT, p_paid BOOLEAN)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_method TEXT;
  v_status TEXT;
  v_paid_at TIMESTAMPTZ;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT payment_method INTO v_method FROM entries WHERE id = p_entry_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'entry not found'; END IF;

  IF v_method = 'credit' THEN
    RAISE EXCEPTION 'credit payment is managed by stripe';
  END IF;

  UPDATE entries
     SET payment_status = CASE WHEN p_paid THEN 'completed' ELSE 'pending' END,
         paid_at        = CASE WHEN p_paid THEN COALESCE(paid_at, now()) ELSE NULL END
   WHERE id = p_entry_id
   RETURNING payment_status, paid_at INTO v_status, v_paid_at;

  RETURN jsonb_build_object('id', p_entry_id, 'payment_status', v_status, 'paid_at', v_paid_at);
END $$;
REVOKE ALL ON FUNCTION admin_set_entry_payment(BIGINT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_entry_payment(BIGINT, BOOLEAN) TO authenticated;

-- ※ entries の RLS は既存のまま使う（20260707: admins can select / update entries、
--    どちらも is_admin() ガード）。テーブル権限も追加しない。


-- ── 2) contacts: 匿名・一般ログインユーザーから隠す ──────────
DROP POLICY IF EXISTS "authenticated can read contacts" ON contacts;
DROP POLICY IF EXISTS "authenticated can update contacts" ON contacts;

CREATE POLICY "admins can read contacts" ON contacts
  FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "admins can update contacts" ON contacts
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- 多層防御: 読み書きは下のRPC（SECURITY DEFINER）経由に一本化し、
-- テーブルへの直接の SELECT/UPDATE 権限そのものを外す。
-- 送信（INSERT）は /contact フォームが使うので anon・authenticated ともに残す。
REVOKE SELECT, UPDATE, DELETE ON public.contacts FROM anon, authenticated;
GRANT INSERT ON public.contacts TO anon, authenticated;
GRANT ALL ON public.contacts TO service_role;


-- ── 3) contacts: 管理者用の一覧・状態変更RPC ─────────────────
CREATE OR REPLACE FUNCTION admin_list_contacts()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'created_at', c.created_at,
    'name', c.name,
    'email', c.email,
    'category', c.category,
    'message', c.message,
    'lang', c.lang,
    'status', c.status
  ) ORDER BY c.created_at DESC), '[]'::jsonb) INTO result
  FROM contacts c;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION admin_list_contacts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_list_contacts() TO authenticated;

CREATE OR REPLACE FUNCTION admin_set_contact_status(p_id UUID, p_status TEXT)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_status TEXT;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF p_status NOT IN ('new', 'replied', 'closed') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  UPDATE contacts SET status = p_status WHERE id = p_id
  RETURNING status INTO v_status;
  IF NOT FOUND THEN RAISE EXCEPTION 'contact not found'; END IF;

  RETURN jsonb_build_object('id', p_id, 'status', v_status);
END $$;
REVOKE ALL ON FUNCTION admin_set_contact_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_contact_status(UUID, TEXT) TO authenticated;


-- ── 参考: 適用済みで再実行不要なもの ──────────────────────────
--   entries.payment_method / payment_status / stripe_payment_id / paid_at
--     … 20260711_add_payment_columns.sql（適用済み）
--   payment_reminders テーブル + 未入金インデックス + pg_cron の毎日実行
--     … 2026-07-30 に本番適用済み（ソースは security/rls-hardening-and-quality の
--        supabase/migrations/20260730_payment_reminders.sql / _cron.sql）
