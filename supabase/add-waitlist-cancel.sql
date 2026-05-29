-- ===================================================
-- キャンセル待ち・キャンセル機能のためのスキーマ更新
-- ===================================================

-- 1. entries テーブルに status・キャンセル関連カラムを追加
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'waitlist', 'cancelled')),
  ADD COLUMN IF NOT EXISTS cancel_token UUID DEFAULT gen_random_uuid() UNIQUE,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- 2. status カラムにインデックス
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries(status);
CREATE INDEX IF NOT EXISTS idx_entries_cancel_token ON entries(cancel_token);
CREATE INDEX IF NOT EXISTS idx_entries_tournament_status ON entries(tournament_id, status);

-- 3. confirmed 件数ビュー（既存の entry_counts ビューがあれば更新）
-- ※ TournamentCard の残席計算を confirmed のみにする
CREATE OR REPLACE VIEW confirmed_entry_counts AS
  SELECT tournament_id, COUNT(*) AS count
  FROM entries
  WHERE status = 'confirmed'
  GROUP BY tournament_id;

-- 4. waitlist 件数ビュー
CREATE OR REPLACE VIEW waitlist_entry_counts AS
  SELECT tournament_id, COUNT(*) AS count
  FROM entries
  WHERE status = 'waitlist'
  GROUP BY tournament_id;

-- 5. RLS: cancel_token で自分のエントリーをキャンセル可能（認証不要・公開）
-- cancel_tokenを知っている人だけがキャンセルできる
CREATE POLICY IF NOT EXISTS "cancel by token" ON entries
  FOR UPDATE
  USING (cancel_token = current_setting('request.jwt.claims', true)::json->>'cancel_token')
  WITH CHECK (status = 'cancelled');

-- ※ 上記RLSはEdge Function経由で service_role を使う方が安全なため、
--    実際にはEdge FunctionでSupabaseサービスキーを使ってupdateする。
--    そのため追加のRLSポリシーは不要。
