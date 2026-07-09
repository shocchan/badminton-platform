-- ===================================================
-- 管理画面クイック消込用: クーポン一覧RPC（2026-07-07）
-- 管理画面でチェックを入れて使用済みにする運用のため、
-- 管理者が全クーポンを一覧できるRPCを追加。消込は既存の admin_redeem_coupon を使う。
-- ===================================================

CREATE OR REPLACE FUNCTION admin_list_coupons()
RETURNS TABLE(id uuid, type text, status text, owner text, issued_at timestamptz, used_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.type, c.status,
         COALESCE(u.raw_user_meta_data->>'nickname', u.email, '(未登録ゲスト)') AS owner,
         c.issued_at, c.used_at
  FROM coupons c
  LEFT JOIN auth.users u ON u.id = c.user_id
  WHERE is_admin()  -- 管理者以外は0件
  ORDER BY (c.status IN ('claimed','reserved')) DESC, c.issued_at DESC
  LIMIT 200;
$$;
GRANT EXECUTE ON FUNCTION admin_list_coupons() TO authenticated;
