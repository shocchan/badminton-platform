-- ============================================================
-- ai_usage_daily の二層防御・第1弾: 加算専用RPC（2026-08-17 総監査P1）
--
-- 問題: authenticated が ai_usage_daily を直接 insert/update できる
--   （update ポリシーに with_check も無く、本人行なら絶対値で自由に書ける）。
--   APIを直接叩けば seconds_used=0 等へ上書きでき、コスト上限
--   （1日45分・月6時間・$40警告）を無効化できる。
--
-- 対策（vocab 3表 20260728000000 と同じ二層防御パターンの応用）:
--   第1弾（本ファイル）: 加算しかできない security definer RPC を追加
--   第2弾（20260817010000）: クライアント切替デプロイ後に authenticated の
--     insert/update を revoke。staging/本番同一DBのため revoke を先にすると
--     旧バンドルの利用量記録が失敗する。順序: RPC作成→デプロイ→revoke
--
-- RPC設計:
--   - 加算のみ。絶対値の上書き・減算は構造的に不可（負値は0へ切り上げ）
--   - learner は auth.uid() から解決（本人のみ。引数で learner_id を受けない）
--   - 1回の加算上限: 秒は ai_config.usage_limits.session_max_seconds（既定240）、
--     コストは $1（実コストは4分会話で$0.1前後。桁違いの注入を遮断）
--   - sessions_count には触れない（ai_start_session が予約時に加算済み）
--   - 日付はサーバ側で Asia/Tokyo を決める（ai_start_session の日次上限判定と
--     同じ行へ積む。従来クライアントのUTC日付ではJST 0〜9時の秒数が前日行へ
--     逃げ、daily_max_seconds 判定から漏れていた）
-- ============================================================

create or replace function public.ai_record_usage(p_seconds int, p_cost_usd numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learner_id uuid;
  v_limits jsonb;
  v_max_seconds int;
  v_seconds int;
  v_cost numeric;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
begin
  select id into v_learner_id from public.ai_learners where user_id = auth.uid() limit 1;
  if v_learner_id is null then
    return jsonb_build_object('ok', false, 'code', 'no_learner');
  end if;

  select value into v_limits from public.ai_config where key = 'usage_limits';
  v_max_seconds := coalesce((v_limits->>'session_max_seconds')::int, 240);

  -- サニタイズ: 負値は0（減算不可）・1セッション分を超える値はクランプ
  v_seconds := least(greatest(coalesce(p_seconds, 0), 0), v_max_seconds);
  v_cost := least(greatest(coalesce(p_cost_usd, 0), 0), 1.0);
  if v_seconds = 0 and v_cost = 0 then
    return jsonb_build_object('ok', true, 'code', 'noop');
  end if;

  insert into public.ai_usage_daily
    (learner_id, usage_date, sessions_count, seconds_used, estimated_cost_usd, updated_at)
    values (v_learner_id, v_today, 0, v_seconds, v_cost, now())
  on conflict (learner_id, usage_date) do update
    set seconds_used = ai_usage_daily.seconds_used + excluded.seconds_used,
        estimated_cost_usd = ai_usage_daily.estimated_cost_usd + excluded.estimated_cost_usd,
        updated_at = now();

  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.ai_record_usage(int, numeric) from public;
revoke all on function public.ai_record_usage(int, numeric) from anon;
grant execute on function public.ai_record_usage(int, numeric) to authenticated, service_role;
