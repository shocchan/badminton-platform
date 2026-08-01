-- ===================================================
-- 個人情報の公開読み取りを廃止するための RPC 追加（2026-08-02）
-- 【フェーズ1／3】追加のみ。既存の権限・ポリシーは一切変更しないので、
-- 適用しても現在の挙動は変わらない（フロントを切り替えるまで無効なまま）。
--
-- 背景: 公開anonキーだけで以下が読めていた。
--   - entries: 氏名・電話番号・メール・cancel_token（大会エントリー17件）
--   - activity_entries: cancel_code（＝画面に出ている氏名と合わせるとキャンセルし放題）
--   - members / groups.admin_password
-- 画面が必要としているのは「件数」と「本人の1件」だけなので、
-- SECURITY DEFINER の RPC で必要最小限だけを返すようにする。
-- ===================================================

-- ── 1) 大会の確定エントリー数（個人情報は返さない） ──
-- HomePage: 全大会の残り枠表示に使用
CREATE OR REPLACE FUNCTION public.get_tournament_entry_counts()
RETURNS TABLE (tournament_id UUID, confirmed_count BIGINT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.tournament_id, count(*)
  FROM entries e
  WHERE e.status = 'confirmed'
  GROUP BY e.tournament_id
$$;
GRANT EXECUTE ON FUNCTION public.get_tournament_entry_counts() TO anon, authenticated;

-- TournamentDetailPage / EntryForm: 1大会ぶんの確定数
CREATE OR REPLACE FUNCTION public.get_tournament_entry_count(p_tournament_id UUID)
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT count(*) FROM entries
  WHERE tournament_id = p_tournament_id AND status = 'confirmed'
$$;
GRANT EXECUTE ON FUNCTION public.get_tournament_entry_count(UUID) TO anon, authenticated;

-- ── 2) 重複申込チェック／未払いエントリーの再開 ──
-- 申込フォームが「同じメールで既に申し込んでいないか」を確認するために使う。
-- テーブル全体を読ませる代わりに、大会×メールが完全一致した1件だけを返す。
CREATE OR REPLACE FUNCTION public.find_entry_for_resume(p_tournament_id UUID, p_email TEXT)
RETURNS TABLE (id UUID, status TEXT, cancel_token TEXT, payment_status TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.id, e.status, e.cancel_token, e.payment_status
  FROM entries e
  WHERE e.tournament_id = p_tournament_id
    AND lower(e.email) = lower(trim(p_email))
    AND e.status <> 'cancelled'
  LIMIT 1
$$;
GRANT EXECUTE ON FUNCTION public.find_entry_for_resume(UUID, TEXT) TO anon, authenticated;

-- ── 3) ログイン中ユーザー自身の大会エントリー（MyPage） ──
-- メールを引数で受け取らず、JWTのメールで引くので他人のぶんは取得できない。
CREATE OR REPLACE FUNCTION public.get_my_entries()
RETURNS TABLE (id UUID, tournament_id UUID, status TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT e.id, e.tournament_id, e.status
  FROM entries e
  WHERE auth.jwt() ->> 'email' IS NOT NULL
    AND lower(e.email) = lower(auth.jwt() ->> 'email')
    AND e.status <> 'cancelled'
$$;
GRANT EXECUTE ON FUNCTION public.get_my_entries() TO authenticated;

-- ── 4) 通常活動のキャンセル（コード照合をサーバー側で行う） ──
-- 従来は「cancel_code をクライアントが読んで照合 → 直接 DELETE/UPDATE」だったため、
-- コードが読める＝誰でも他人の申込を消せる状態だった。
-- 照合と削除をこの関数の中に閉じ込め、anon の DELETE/UPDATE 権限を不要にする。
CREATE OR REPLACE FUNCTION public.cancel_activity_entry(
  p_activity_id UUID,
  p_name TEXT,
  p_code TEXT,
  p_qty INT
)
RETURNS TABLE (cancelled INT, remaining INT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row RECORD;
  v_left INT;
  v_total INT;
  v_done INT := 0;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'invalid quantity';
  END IF;

  SELECT coalesce(sum(quantity), 0) INTO v_total
  FROM activity_entries
  WHERE activity_id = p_activity_id
    AND name = trim(p_name)
    AND cancel_code = trim(p_code);

  IF v_total = 0 THEN
    RAISE EXCEPTION 'entry not found';
  END IF;

  v_left := least(p_qty, v_total);

  -- 補欠（waitlist）から先に取り消す。status の降順＝waitlist → confirmed
  FOR v_row IN
    SELECT id, quantity FROM activity_entries
    WHERE activity_id = p_activity_id
      AND name = trim(p_name)
      AND cancel_code = trim(p_code)
    ORDER BY status DESC, created_at ASC
  LOOP
    EXIT WHEN v_left <= 0;
    IF v_left >= v_row.quantity THEN
      DELETE FROM activity_entries WHERE id = v_row.id;
      v_done := v_done + v_row.quantity;
      v_left := v_left - v_row.quantity;
    ELSE
      UPDATE activity_entries SET quantity = quantity - v_left WHERE id = v_row.id;
      v_done := v_done + v_left;
      v_left := 0;
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_done, (v_total - v_done);
END $$;
GRANT EXECUTE ON FUNCTION public.cancel_activity_entry(UUID, TEXT, TEXT, INT) TO anon, authenticated;
