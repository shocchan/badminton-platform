-- 未入金の自動督促（2026-07-30）
-- 目的:
--   PayPay/銀行振込の未入金者に段階的な督促メールを自動送信し、
--   管理ページで「入金確認」を押した時点で督促を止める。
--   最終督促しても入金がない場合は管理者に通知するだけ（自動キャンセルはしない）。

-- ── 1) 督促の送信台帳（同じ段階を二重送信しないため） ──
CREATE TABLE IF NOT EXISTS payment_reminders (
  id BIGSERIAL PRIMARY KEY,
  entry_id BIGINT NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,               -- 'before3' | 'due' | 'overdue' | 'final'
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_payment_reminders_entry ON payment_reminders (entry_id);

ALTER TABLE payment_reminders ENABLE ROW LEVEL SECURITY;

-- Edge Function（service_role）専用テーブル。anon/authenticated には触らせない。
REVOKE ALL ON public.payment_reminders FROM anon, authenticated;
GRANT ALL ON public.payment_reminders TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.payment_reminders_id_seq TO service_role;

-- ── 2) 未入金抽出を速くするインデックス ──
CREATE INDEX IF NOT EXISTS idx_entries_unpaid
  ON entries (tournament_id)
  WHERE status = 'confirmed' AND (payment_status IS NULL OR payment_status <> 'completed');

-- ── 3) 管理者が「入金確認」を押せるように（RLSポリシーは既存の is_admin() ガードを利用） ──
GRANT SELECT, UPDATE ON public.entries TO authenticated;

-- ※ 既存データの一括補正はあえて行わない。
--    payment_status には 'refunded'（返金済み）も実際に入っており、
--    paid_at の有無だけで 'completed' に書き換えると返金記録を壊すため。
