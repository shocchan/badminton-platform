-- ===================================================
-- ゲームセッション（プレイ時間の整合性チェック用）（2026-07-10）
--
-- rallyCount はクライアント自己申告のため、開始時刻をサーバー側に記録し、
-- 「申告ラリー数 × 最短ラリー時間(600ms) > 実経過時間」の申告を弾く。
-- AIショットの飛行時間が最速620msなので600ms/ラリー未満は物理的に不可能。
-- Edge Function (service_role) のみが読み書きする。クライアント直アクセス不可。
-- ===================================================

CREATE TABLE IF NOT EXISTS public.game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uuid TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.game_sessions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.game_sessions TO service_role;
CREATE INDEX IF NOT EXISTS game_sessions_device_idx
  ON public.game_sessions (device_uuid, started_at DESC);
