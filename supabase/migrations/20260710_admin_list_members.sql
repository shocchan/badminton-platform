-- ===================================================
-- 管理画面: 登録者一覧RPC（2026-07-10）
-- members に auth.users のメールアドレスと保有クーポンを結合して返す。
-- チャージ残高はスプレッドシート管理のため返さない。
-- ===================================================

CREATE OR REPLACE FUNCTION admin_list_members()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COALESCE(jsonb_agg(row_data ORDER BY sort_key DESC NULLS LAST), '[]'::jsonb) INTO result
  FROM (
    SELECT m.created_at AS sort_key, jsonb_build_object(
      'id', m.id,
      'member_number', m.member_number,
      'name', m.name,
      'email', u.email,
      'active', m.active,
      'created_at', m.created_at,
      'coupons', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', c.id, 'type', c.type, 'status', c.status, 'issued_at', c.issued_at
        ) ORDER BY c.issued_at DESC)
        FROM coupons c WHERE m.user_id IS NOT NULL AND c.user_id = m.user_id
      ), '[]'::jsonb)
    ) AS row_data
    FROM members m
    LEFT JOIN auth.users u ON u.id = m.user_id
  ) t;
  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION admin_list_members() TO authenticated;
