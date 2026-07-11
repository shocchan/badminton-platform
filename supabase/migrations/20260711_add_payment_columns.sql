-- Vol.4 クレジット決済対応: entries に決済トラッキング用カラムを追加
-- cancel_token は既存（add-waitlist-cancel.sql で追加済み）のため対象外
ALTER TABLE entries ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20);
-- 'credit' | 'paypay' | 'bank'（NULL = 未選択）

ALTER TABLE entries ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending';
-- 'pending' | 'completed' | 'failed'

ALTER TABLE entries ADD COLUMN IF NOT EXISTS stripe_payment_id VARCHAR(100);

ALTER TABLE entries ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

-- Stripe PaymentIntent ID での照合用（confirm-payment の冪等化）
CREATE INDEX IF NOT EXISTS idx_entries_stripe_payment_id ON entries (stripe_payment_id) WHERE stripe_payment_id IS NOT NULL;
