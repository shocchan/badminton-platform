-- AI日本語コース: 「日々は使い放題の感覚＋1人あたりは月次で天井」へ利用制限を再設計。
--
-- 方針（CEO決定 2026-07-22）:
--  - 有料利用者には惜しみなく攻略してもらう。日次はスパイク防止の軽い枠だけ（10回/45分）。
--  - 本当のアッパーは月次（既定 80回/月）。コスト暴走はここで守る。
--  - learner ごとに admin_overrides.monthlyMaxSessions で個別に天井を変更可能（VIP対応）。
--
-- 既存テーブル・データは壊さない。ai_config の値を更新し、ai_start_session を置き換えるだけ。

-- ── 上限値の更新（既存キーは jsonb マージで上書き。他キーは保持） ──
update public.ai_config
  set value = value || jsonb_build_object(
    'session_max_seconds', 240,     -- 1回最大4分（据え置き）
    'daily_max_sessions', 10,       -- 日次スパイク防止（緩め）
    'daily_max_seconds', 2700,      -- 1日最大45分
    'monthly_max_sessions', 80,     -- ★1人あたりの月次アッパー
    'monthly_max_seconds', 21600,   -- 月最大6時間（回数が主で、時間は副次ガード）
    'monthly_cost_warn_usd', 40
  )
  where key = 'usage_limits';

-- 万一 usage_limits 行が無い場合に備えて（通常は 20260718 で投入済み）
insert into public.ai_config (key, value) values
  ('usage_limits', '{"session_max_seconds":240,"daily_max_sessions":10,"daily_max_seconds":2700,"monthly_max_sessions":80,"monthly_max_seconds":21600,"monthly_cost_warn_usd":40}'::jsonb)
on conflict (key) do nothing;

-- ── セッション開始RPC: 日次（スパイク防止）＋月次（本当のアッパー）を確認 ──
create or replace function public.ai_start_session(
  p_mission_id text,
  p_lesson_kind text,
  p_mode text,
  p_difficulty int,
  p_target_expression text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learner public.ai_learners%rowtype;
  v_limits jsonb;
  v_max_sessions int;
  v_max_seconds int;
  v_monthly_max_sessions int;
  v_monthly_max_seconds int;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_month_start date := date_trunc('month', (now() at time zone 'Asia/Tokyo'))::date;
  v_usage public.ai_usage_daily%rowtype;
  v_month_sessions int;
  v_month_seconds int;
  v_active int;
  v_session_id uuid;
begin
  select * into v_learner from public.ai_learners where user_id = auth.uid() limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_learner');
  end if;
  if not v_learner.is_active then
    return jsonb_build_object('ok', false, 'code', 'learner_suspended');
  end if;

  perform public.ai_release_stale_sessions(v_learner.id);

  -- 同時アクティブセッション（別タブ・二重起動の防止）
  select count(*) into v_active from public.ai_learning_sessions
    where learner_id = v_learner.id and completion_status = 'in_progress';
  if v_active > 0 then
    return jsonb_build_object('ok', false, 'code', 'session_already_active');
  end if;

  select value into v_limits from public.ai_config where key = 'usage_limits';
  v_max_sessions := coalesce((v_limits->>'daily_max_sessions')::int, 10);
  v_max_seconds  := coalesce((v_limits->>'daily_max_seconds')::int, 2700);
  -- 月次上限は learner個別指定（admin_overrides.monthlyMaxSessions）を最優先
  v_monthly_max_sessions := coalesce(
    (v_learner.admin_overrides->>'monthlyMaxSessions')::int,
    (v_limits->>'monthly_max_sessions')::int, 80);
  v_monthly_max_seconds := coalesce(
    (v_learner.admin_overrides->>'monthlyMaxSeconds')::int,
    (v_limits->>'monthly_max_seconds')::int, 21600);

  -- 当日行をロックして確認（複数タブの同時開始を直列化）
  insert into public.ai_usage_daily (learner_id, usage_date)
    values (v_learner.id, v_today)
    on conflict (learner_id, usage_date) do nothing;
  select * into v_usage from public.ai_usage_daily
    where learner_id = v_learner.id and usage_date = v_today for update;

  -- 日次（スパイク防止）
  if v_usage.sessions_count >= v_max_sessions then
    return jsonb_build_object('ok', false, 'code', 'daily_session_limit');
  end if;
  if v_usage.seconds_used >= v_max_seconds then
    return jsonb_build_object('ok', false, 'code', 'daily_time_limit');
  end if;

  -- 月次（本当のアッパー）。当月の合算（今日の現在値を含む）で判定
  select coalesce(sum(sessions_count), 0), coalesce(sum(seconds_used), 0)
    into v_month_sessions, v_month_seconds
    from public.ai_usage_daily
    where learner_id = v_learner.id and usage_date >= v_month_start and usage_date <= v_today;
  if v_month_sessions >= v_monthly_max_sessions then
    return jsonb_build_object('ok', false, 'code', 'monthly_session_limit');
  end if;
  if v_month_seconds >= v_monthly_max_seconds then
    return jsonb_build_object('ok', false, 'code', 'monthly_time_limit');
  end if;

  insert into public.ai_learning_sessions
    (learner_id, mission_id, mode, lesson_kind, difficulty, target_expression, completion_status)
  values
    (v_learner.id, p_mission_id, coalesce(p_mode, 'voice'), coalesce(p_lesson_kind, 'new'),
     coalesce(p_difficulty, 2), p_target_expression, 'in_progress')
  returning id into v_session_id;

  -- 予約時点で回数を消費する（ページ更新で回数だけ増える事故は
  -- session_already_active で弾かれるため発生しない）
  update public.ai_usage_daily
    set sessions_count = sessions_count + 1, updated_at = now()
    where learner_id = v_learner.id and usage_date = v_today;

  return jsonb_build_object(
    'ok', true,
    'sessionId', v_session_id,
    'learnerId', v_learner.id,
    'remainingSessions', v_max_sessions - (v_usage.sessions_count + 1),
    'remainingMonthly', greatest(v_monthly_max_sessions - (v_month_sessions + 1), 0)
  );
end;
$$;
