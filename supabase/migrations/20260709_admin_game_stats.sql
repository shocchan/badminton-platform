-- ===================================================
-- 管理画面: バド対決ゲームの統計RPC（2026-07-09）
-- 実施回数・プレイ人数・最高ラリー・当選数などを管理者だけが見られる。
-- 将来の「累計記録・最高ラリーランキング・ブログ発表」もこのデータで拡張可能。
-- ===================================================

CREATE OR REPLACE FUNCTION admin_game_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT is_admin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'total_plays',     (SELECT count(*) FROM game_plays),
    'plays_today',     (SELECT count(*) FROM game_plays
                        WHERE played_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Tokyo')) AT TIME ZONE 'Asia/Tokyo'),
    'plays_7d',        (SELECT count(*) FROM game_plays WHERE played_at >= now() - interval '7 days'),
    'plays_30d',       (SELECT count(*) FROM game_plays WHERE played_at >= now() - interval '30 days'),
    'unique_players',  (SELECT count(DISTINCT COALESCE(user_id::text, guest_device_id::text)) FROM game_plays),
    'max_rally',       (SELECT COALESCE(max(rally_count), 0) FROM game_plays),
    'avg_rally',       (SELECT COALESCE(round(avg(rally_count)::numeric, 1), 0) FROM game_plays),
    'total_draws',     (SELECT COALESCE(sum(draw_count), 0) FROM game_plays),
    'winners',         (SELECT count(*) FROM lottery_draws WHERE is_winner),
    'ramen_total',     (SELECT count(*) FROM coupons WHERE type = 'ramen'),
    'badminton_total', (SELECT count(*) FROM coupons WHERE type = 'badminton'),
    'top_rallies',     (SELECT COALESCE(jsonb_agg(r), '[]'::jsonb)
                        FROM (SELECT rally_count, played_at FROM game_plays
                              ORDER BY rally_count DESC, played_at ASC LIMIT 5) r)
  ) INTO result;
  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION admin_game_stats() TO authenticated;
