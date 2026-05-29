-- ========================================
-- entries テーブルに partner_name カラムを追加
-- ========================================

ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS partner_name TEXT;
