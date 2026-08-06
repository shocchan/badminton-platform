-- 大会ごとの「追加受付」override と、申込のサーバー側強制。
--
-- 背景: 「開催2週間以内は申込不可」は従来フロントのJSにしか無く、
--       匿名キーがあれば締切後・定員超過・重複でも entries に直接INSERTできた。
--       共通ルールは一切緩めずに、大会単位のoverrideと、DB側での強制を追加する。
--
-- ロールバックは同ディレクトリの 20260802020000_late_entry_override_rollback.sql

-- ─────────────────────────────────────────────────────────────
-- 1) 追加受付の個別override列（既定NULL＝全大会が従来どおりの共通ルール）
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS late_entry_until timestamptz;

COMMENT ON COLUMN public.tournaments.late_entry_until IS
  '追加受付の締切（大会単位のoverride）。NULLなら共通ルール（開催14日前 23:59:59 JST）のみ適用。'
  '値が入っている大会は共通締切を過ぎてもこの日時まで受け付け、その期間はクレジットカード決済のみ許可する。';

-- 共通ルールの締切（開催14日前 23:59:59 日本時間）。1箇所に集約する
CREATE OR REPLACE FUNCTION public.standard_entry_deadline(p_event_date date)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
AS $$
  SELECT ((p_event_date - 14) + time '23:59:59') AT TIME ZONE 'Asia/Tokyo'
$$;

-- 実際に適用される締切（overrideがあればそちら）
CREATE OR REPLACE FUNCTION public.tournament_entry_deadline(p_tournament_id bigint)
RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(t.late_entry_until, public.standard_entry_deadline(t.event_date))
  FROM tournaments t WHERE t.id = p_tournament_id
$$;

-- 今まさに追加受付ウィンドウ中か（＝クレジット限定にすべきか）
CREATE OR REPLACE FUNCTION public.tournament_is_late_entry(p_tournament_id bigint)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(
    t.late_entry_until IS NOT NULL
      AND now() <= t.late_entry_until
      AND now() >  public.standard_entry_deadline(t.event_date),
    false)
  FROM tournaments t WHERE t.id = p_tournament_id
$$;

-- ─────────────────────────────────────────────────────────────
-- 2) 申込作成RPC
--    締切・重複・定員を advisory lock の中で原子的に判定してからINSERTする。
--    同時アクセスでも定員超過・重複が発生しない。
-- ─────────────────────────────────────────────────────────────
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
GRANT EXECUTE ON FUNCTION public.tournament_entry_deadline(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tournament_is_late_entry(bigint) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.standard_entry_deadline(date) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────
-- 3) 匿名の直接INSERTを閉じる
--    （これが残っていると締切・定員・重複をすべてバイパスできてしまう）
--    以後 entries への新規申込は create_tournament_entry 経由のみ。
--    Edge Function は service_role なのでRLSの影響を受けない。
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Allow insert for all"   ON public.entries;
DROP POLICY IF EXISTS "entries_insert_public"  ON public.entries;
DROP POLICY IF EXISTS "entries_insert_anon"    ON public.entries;

REVOKE INSERT ON public.entries FROM anon;
REVOKE INSERT ON public.entries FROM authenticated;
