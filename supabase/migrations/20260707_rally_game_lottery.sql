-- ===================================================
-- バド対決ゲーム: プレイ記録・抽選・無料券テーブル
-- Supabaseダッシュボード > SQL Editor で実行する
--
-- アクセスは全て Edge Function（service_role）経由。
-- クライアント（anon）には一切権限を与えない。
-- 当選確率・月間上限は lottery_config で管理（非公表。SQLで変更可能）
-- ===================================================

-- ゲスト端末（未登録ユーザーのプレイ・当選を一時的に紐付ける）
CREATE TABLE IF NOT EXISTS guest_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_uuid TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ゲームプレイ記録
CREATE TABLE IF NOT EXISTS game_plays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  guest_device_id UUID REFERENCES guest_devices(id),
  rally_count INT NOT NULL CHECK (rally_count >= 0 AND rally_count <= 500),
  draw_count INT NOT NULL DEFAULT 0, -- 実際に抽選した回数（1日上限適用後。0=抽選なし）
  played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id IS NOT NULL OR guest_device_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_game_plays_device_played
  ON game_plays(guest_device_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_plays_user_played
  ON game_plays(user_id, played_at DESC);

-- 抽選結果（1ゲーム=1行。draw_count回ぶんの判定をまとめて記録）
CREATE TABLE IF NOT EXISTS lottery_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_play_id UUID NOT NULL REFERENCES game_plays(id),
  is_winner BOOLEAN NOT NULL,
  prize_type TEXT CHECK (prize_type IN ('ramen', 'badminton')),
  drawn_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lottery_draws_drawn_at ON lottery_draws(drawn_at DESC);

-- 無料券（ラーメン / バド活動）
CREATE TABLE IF NOT EXISTS coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('ramen', 'badminton')),
  user_id UUID REFERENCES auth.users(id),          -- 発行時点でゲストならNULL（登録時に引き継ぎ）
  guest_device_id UUID REFERENCES guest_devices(id),
  status TEXT NOT NULL DEFAULT 'unclaimed'
    CHECK (status IN ('unclaimed', 'claimed', 'reserved', 'used')),
    -- unclaimed: 当選したが未登録 / claimed: 登録済みで受け取り確定
    -- reserved: 活動申込で使用予約中 / used: 使用済み
  game_play_id UUID REFERENCES game_plays(id),
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  CHECK (user_id IS NOT NULL OR guest_device_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_coupons_type_issued ON coupons(type, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_coupons_device ON coupons(guest_device_id);
CREATE INDEX IF NOT EXISTS idx_coupons_user ON coupons(user_id);

-- 抽選設定（非公表の運用パラメータ。ダッシュボードから変更できる）
CREATE TABLE IF NOT EXISTS lottery_config (
  key TEXT PRIMARY KEY,
  value INT NOT NULL
);

INSERT INTO lottery_config (key, value) VALUES
  ('ramen_odds', 1000),          -- ラーメン券: 1/1000（1抽選あたり）
  ('badminton_odds', 500),       -- バド無料券: 1/500（1抽選あたり）
  ('ramen_monthly_cap', 3),      -- ラーメン券: 月間上限（非公表）
  ('badminton_monthly_cap', 5),  -- バド無料券: 月間上限（非公表）
  ('daily_game_limit', 10),      -- 1端末が1日に抽選対象になれるゲーム数
  ('rallies_per_draw', 15)       -- 抽選1回に必要なラリー数（15ラリー=1回、30=2回…）
ON CONFLICT (key) DO NOTHING;

-- RLS: 全テーブル有効化。ポリシーは作らない＝anon/authenticatedは一切アクセス不可。
-- Edge Function（service_role）はRLSをバイパスするのでポリシー不要。
ALTER TABLE guest_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE lottery_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE lottery_config ENABLE ROW LEVEL SECURITY;

-- service_role にテーブル権限を明示付与（このプロジェクトはデフォルトGRANTが無い場合があるため）
GRANT ALL ON public.guest_devices TO service_role;
GRANT ALL ON public.game_plays TO service_role;
GRANT ALL ON public.lottery_draws TO service_role;
GRANT ALL ON public.coupons TO service_role;
GRANT ALL ON public.lottery_config TO service_role;
