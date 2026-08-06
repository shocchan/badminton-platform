-- 追加受付で「決済せずに離脱した申込」が定員枠を専有し続ける問題への対応。
--
-- 背景: entries は決済前に status='confirmed' で作られる（既存仕様）。
--       通常受付では当日現金・PayPay・銀行振込があるため確定扱いで問題ないが、
--       追加受付はカード決済のみ＝決済完了して初めて参加確定。
--       決済画面で離脱した申込を放置すると、その枠が永久に埋まったままになる。
--
-- 対応: 申込作成時（advisory lock 内）に、追加受付中に作られた未決済の古い申込を
--       自動キャンセルして枠を戻してから、定員を数える。
--
-- 【安全性】対象を厳密に絞っており、既存の正規参加者には触れない:
--   ・payment_method IS NULL      → PayPay/銀行振込を選んだ人は対象外
--   ・payment_status = 'pending'  → 入金済み・返金済みは対象外
--   ・created_at > 共通締切        → 通常受付期間の申込は対象外
--   ・created_at < now() - 30分    → 決済作業中の人は対象外
--
-- ロールバック: 20260802030000_late_entry_reclaim_unpaid_rollback.sql
--   （関数を前版に戻すだけ。自動キャンセルされた行は cancel_reason で特定して復旧可能）

CREATE OR REPLACE FUNCTION public.create_tournament_entry(
  p_tournament_id bigint,
  p_name          text,
  p_email         text,
  p_phone         text DEFAULT NULL,
  p_partner_name  text DEFAULT NULL,
  p_notes         text DEFAULT NULL
)
RETURNS TABLE(entry_id bigint, entry_cancel_token uuid, entry_status text, late_entry boolean)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_t         tournaments%ROWTYPE;
  v_deadline  timestamptz;
  v_late      boolean;
  v_confirmed bigint;
  v_status    text;
  v_id        bigint;
  v_token     uuid;
BEGIN
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'NAME_REQUIRED' USING ERRCODE = 'check_violation';
  END IF;
  IF p_email IS NULL OR btrim(p_email) !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'EMAIL_INVALID' USING ERRCODE = 'check_violation';
  END IF;

  -- 同じ大会への同時申込を直列化（トランザクション終了で自動解放）
  PERFORM pg_advisory_xact_lock(hashtext('tournament_entry'), p_tournament_id::int);

  SELECT * INTO v_t FROM tournaments t WHERE t.id = p_tournament_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_t.status <> 'active' OR COALESCE(v_t.visibility, 'published') <> 'published' THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_OPEN' USING ERRCODE = 'check_violation';
  END IF;

  -- 締切判定（override が無ければ共通ルール。共通ルールは緩めない）
  v_deadline := COALESCE(v_t.late_entry_until, public.standard_entry_deadline(v_t.event_date));
  IF now() > v_deadline THEN
    RAISE EXCEPTION 'ENTRY_CLOSED' USING ERRCODE = 'check_violation';
  END IF;

  v_late := v_t.late_entry_until IS NOT NULL
        AND now() > public.standard_entry_deadline(v_t.event_date);

  -- 追加受付中に作られた未決済の放置申込を解放してから定員を数える
  IF v_late THEN
    UPDATE entries e
       SET status        = 'cancelled',
           cancelled_at  = now(),
           cancel_reason = '未決済のため自動解放（追加受付）'
     WHERE e.tournament_id  = p_tournament_id
       AND e.status         = 'confirmed'
       AND e.payment_status = 'pending'
       AND e.payment_method IS NULL
       AND e.created_at     > public.standard_entry_deadline(v_t.event_date)
       AND e.created_at     < now() - interval '30 minutes';
  END IF;

  -- 重複申込（cancelled 以外、大文字小文字・前後空白は無視）
  IF EXISTS (
    SELECT 1 FROM entries e
     WHERE e.tournament_id = p_tournament_id
       AND lower(e.email) = lower(btrim(p_email))
       AND e.status <> 'cancelled'
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_ENTRY' USING ERRCODE = 'unique_violation';
  END IF;

  SELECT count(*) INTO v_confirmed
    FROM entries e
   WHERE e.tournament_id = p_tournament_id AND e.status = 'confirmed';

  IF v_confirmed >= v_t.capacity THEN
    -- 追加受付は決済前提のため、満員ならキャンセル待ちを作らず拒否する
    -- （通常受付は従来どおりキャンセル待ちに回す）
    IF v_late THEN
      RAISE EXCEPTION 'CAPACITY_FULL' USING ERRCODE = 'check_violation';
    END IF;
    v_status := 'waitlist';
  ELSE
    v_status := 'confirmed';
  END IF;

  INSERT INTO entries (tournament_id, name, phone, email, partner_name, notes, status)
  VALUES (p_tournament_id, btrim(p_name), p_phone, btrim(p_email), p_partner_name, p_notes, v_status)
  RETURNING entries.id, entries.cancel_token INTO v_id, v_token;

  RETURN QUERY SELECT v_id, v_token, v_status, v_late;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tournament_entry(bigint,text,text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_tournament_entry(bigint,text,text,text,text,text) TO anon, authenticated;
