-- ===================================================
-- バド対決ゲーム: 会員登録による当選クーポン受け取り（フェーズ③）
-- Supabaseダッシュボード > SQL Editor または Management API で実行
--
-- クーポンの引き継ぎ（guest→user）は claim-coupons Edge Function（service_role）が行う。
-- ここではログイン会員が「自分のクーポンを読む」ことだけを許可する。
-- ===================================================

GRANT SELECT ON public.coupons TO authenticated;

CREATE POLICY "users can read own coupons" ON coupons
  FOR SELECT TO authenticated USING (user_id = auth.uid());
