-- Friends Beta（2026-09-09 P1-4）：CEOの知人へ1か月無料で配る枠
--
-- 【方針】
-- 一般公開のキャンペーンではない。CEOが招待した人だけが使う。
-- クレジットカード登録なし・メールなし・氏名なし。渡すのは**個人専用URL1本**だけ。
--
-- 【商品カタログには足さない】
-- PLAN_CATALOG に新しい商品を作ると、LP・法務表記・価格テストの全部に波及する。
-- Friends Beta は「売り物」ではなく**受講権の種類**なので、
--   ai_course_access.plan_id = 'friends-beta' / source = 'friends_beta'
-- として既存の仕組みに乗せる。会話枠の判定（ai_start_session）は
-- ai_config.plan_ai_budgets を plan_id で引くので、ここに枠を足すだけで効く。
--
-- 【枠の根拠】
-- 音声会話は1回（最長4分）で約¥83（$0.1344/分・$155/USD・安全率1.2込みで約¥100）。
-- テキスト会話は1回 約¥2。冒険・バトル・模試・復習は端末内で完結して原価ゼロ。
-- 100人×¥10,000 ＝ 1人¥100 なので、**全員が枠を使い切ると足りない**。
-- 実測（13人中6人しか会話を始めていない／平均108秒）から、実際に消えるのは
-- 期待値で1人あたり¥100前後。だから「枠は使える形に取り、総額は cost guard で守る」。
-- 計算は src/lib/aiLesson/course/plans/friendsBeta.ts（純関数）とそのテストが正準。
--
-- rollback: 20260909120000_ai_friends_beta.rollback.sql

-- ── 1. Friends Beta の会話枠を plan_ai_budgets へ足す ──
update public.ai_config
   set value = value || jsonb_build_object(
         'friends-beta', jsonb_build_object(
           'voiceSessionsTotal', 3,
           'voiceSessionsPerDay', 1,
           'textSessionsPerDay', 3
         ))
 where key = 'plan_ai_budgets';

-- ── 2. Friends Beta 全体の設定（席数・予算・日数） ──
insert into public.ai_config (key, value)
values ('friends_beta', jsonb_build_object(
  'days', 30,
  'maxSeats', 100,
  'budgetJpy', 10000,
  -- 警告の段階（%）。100%でも既存利用者を自動で止めない（新規発行だけを止める）
  'guardPercents', jsonb_build_array(70, 85, 100),
  'planId', 'friends-beta',
  'source', 'friends_beta'
))
on conflict (key) do update set value = excluded.value;

-- ── 3. 学習者が自分の残り回数を見るためのRPC ──
/**
 * 自分の会話枠の残り（C-3「残り回数をユーザーにも表示」）。
 *
 * 数え方は ai_start_session と**同じ**にする（画面の数字と、実際に始められるかがズレない）。
 *   ・音声の合計 … この受講権の valid_from 以降に始めた voice セッション数
 *   ・今日ぶん   … JSTの当日に始めた同じ mode のセッション数
 * plan_id が無い人（手動発行の既存生徒）は枠そのものが無いので null を返す。
 */
create or replace function public.ai_my_conversation_budget()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_learner public.ai_learners%rowtype;
  v_access public.ai_course_access%rowtype;
  v_budgets jsonb;
  v_budget jsonb;
  v_voice_total int;
  v_voice_per_day int;
  v_text_per_day int;
  v_used_total int;
  v_used_voice_today int;
  v_used_text_today int;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
begin
  select * into v_learner from public.ai_learners where user_id = auth.uid() limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_learner');
  end if;

  select * into v_access from public.ai_course_access where user_id = auth.uid();
  if not found or v_access.plan_id is null then
    -- 枠が無い（＝共通上限だけ）。無いものを0と見せない
    return jsonb_build_object('ok', true, 'hasBudget', false);
  end if;

  select value into v_budgets from public.ai_config where key = 'plan_ai_budgets';
  v_budget := v_budgets -> v_access.plan_id;
  if v_budget is null then
    return jsonb_build_object('ok', true, 'hasBudget', false);
  end if;

  v_voice_total   := coalesce((v_budget->>'voiceSessionsTotal')::int, 999999);
  v_voice_per_day := coalesce((v_budget->>'voiceSessionsPerDay')::int, 999);
  v_text_per_day  := coalesce((v_budget->>'textSessionsPerDay')::int, 999);

  select count(*) into v_used_total from public.ai_learning_sessions
   where learner_id = v_learner.id and mode = 'voice' and started_at >= v_access.valid_from;
  select count(*) into v_used_voice_today from public.ai_learning_sessions
   where learner_id = v_learner.id and mode = 'voice'
     and (started_at at time zone 'Asia/Tokyo')::date = v_today;
  select count(*) into v_used_text_today from public.ai_learning_sessions
   where learner_id = v_learner.id and mode = 'text'
     and (started_at at time zone 'Asia/Tokyo')::date = v_today;

  return jsonb_build_object(
    'ok', true,
    'hasBudget', true,
    'planId', v_access.plan_id,
    'validUntil', v_access.valid_until,
    'voiceTotal', v_voice_total,
    'voiceRemainingTotal', greatest(v_voice_total - v_used_total, 0),
    'voicePerDay', v_voice_per_day,
    'voiceRemainingToday', greatest(v_voice_per_day - v_used_voice_today, 0),
    'textPerDay', v_text_per_day,
    'textRemainingToday', greatest(v_text_per_day - v_used_text_today, 0)
  );
end;
$$;

revoke all on function public.ai_my_conversation_budget() from public, anon;
grant execute on function public.ai_my_conversation_budget() to authenticated;

-- ── 4. 100人チャレンジのダッシュボード（PART F） ──
/**
 * Friends Beta の進み具合と、AI原価の消化。
 *
 * 【原価について正直に書く】
 * ここが返す金額は ai_usage_daily.estimated_cost_usd の合計で、**推定であって実請求ではない**。
 * 音声はブラウザが OpenAI へ直接つなぐため usage を受け取れず、分数からの見積りしか作れない。
 * 画面でも「推定」と書くこと（scripts/ai-course/reconcile-openai-cost.mjs で突合するまでは）。
 */
create or replace function public.ai_admin_beta_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg jsonb;
  v_plan text;
  v_jpy_per_usd numeric := 155;   -- 円安側に倒した固定値（planAiBudget.JPY_PER_USD と同じ）
  v_seats int;
  v_started int;
  v_first_done int;
  v_second int;
  v_d7 int;
  v_d30 int;
  v_cost_usd numeric;
begin
  if not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;

  select value into v_cfg from public.ai_config where key = 'friends_beta';
  v_plan := coalesce(v_cfg->>'planId', 'friends-beta');

  -- 招待した席（＝Friends Betaの受講権を持つ人）
  select count(*) into v_seats from public.ai_course_access a
   where a.plan_id = v_plan;

  -- 学習を始めた人（会話を1回でも開始）
  select count(distinct l.user_id) into v_started
    from public.ai_course_access a
    join public.ai_learners l on l.user_id = a.user_id
   where a.plan_id = v_plan
     and exists (select 1 from public.ai_learning_sessions s where s.learner_id = l.id);

  -- 初回学習を終えた人（会話を1回でも完了）
  select count(distinct l.user_id) into v_first_done
    from public.ai_course_access a
    join public.ai_learners l on l.user_id = a.user_id
   where a.plan_id = v_plan
     and exists (select 1 from public.ai_learning_sessions s
                  where s.learner_id = l.id and s.completion_status <> 'in_progress');

  -- 2回目に来た人（別の日に2回以上）
  select count(*) into v_second from (
    select l.user_id
      from public.ai_course_access a
      join public.ai_learners l on l.user_id = a.user_id
      join public.ai_learning_sessions s on s.learner_id = l.id
     where a.plan_id = v_plan
     group by l.user_id
    having count(distinct (s.started_at at time zone 'Asia/Tokyo')::date) >= 2
  ) x;

  -- 7日目以降にも来た人 / 30日目付近まで来た人（開始日からの経過で見る）
  select count(*) into v_d7 from (
    select l.user_id
      from public.ai_course_access a
      join public.ai_learners l on l.user_id = a.user_id
      join public.ai_learning_sessions s on s.learner_id = l.id
     where a.plan_id = v_plan and s.started_at >= a.valid_from + interval '7 days'
     group by l.user_id
  ) x;
  select count(*) into v_d30 from (
    select l.user_id
      from public.ai_course_access a
      join public.ai_learners l on l.user_id = a.user_id
      join public.ai_learning_sessions s on s.learner_id = l.id
     where a.plan_id = v_plan and s.started_at >= a.valid_from + interval '25 days'
     group by l.user_id
  ) x;

  -- AI原価（推定）。Friends Beta の learner だけを合算する
  select coalesce(sum(u.estimated_cost_usd), 0) into v_cost_usd
    from public.ai_course_access a
    join public.ai_learners l on l.user_id = a.user_id
    join public.ai_usage_daily u on u.learner_id = l.id
   where a.plan_id = v_plan;

  return jsonb_build_object(
    'ok', true,
    'config', v_cfg,
    'seats', v_seats,
    'maxSeats', coalesce((v_cfg->>'maxSeats')::int, 100),
    'started', v_started,
    'firstLessonDone', v_first_done,
    'secondVisit', v_second,
    'day7', v_d7,
    'day30', v_d30,
    'costUsdEstimated', round(v_cost_usd, 4),
    'costJpyEstimated', round(v_cost_usd * v_jpy_per_usd),
    'budgetJpy', coalesce((v_cfg->>'budgetJpy')::int, 10000),
    'jpyPerUsd', v_jpy_per_usd
  );
end;
$$;

revoke all on function public.ai_admin_beta_dashboard() from public, anon;
grant execute on function public.ai_admin_beta_dashboard() to authenticated;

-- ── 5. Edge Function から学習コードを発行するための入口 ──
/**
 * service_role 用の発行。ai_admin_issue_learning_code は auth.uid() で管理者判定するので、
 * JWT を持たない Edge Function からは使えない。**管理者判定は呼び出し側（Edge Function）が
 * 済ませてからここへ来ること。** この関数は service_role にしか渡さない。
 */
create or replace function public.ai_service_issue_learning_code(p_user_id uuid, p_label text default '')
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
  v_hash text;
  v_id uuid;
begin
  if p_user_id is null then
    return jsonb_build_object('ok', false, 'code', 'no_user');
  end if;

  update public.ai_learning_codes
     set revoked_at = now(), revoked_reason = 'reissued'
   where user_id = p_user_id and revoked_at is null;

  for i in 1..5 loop
    v_code := public.ai_generate_learning_code();
    v_hash := encode(extensions.digest(v_code, 'sha256'), 'hex');
    begin
      insert into public.ai_learning_codes (user_id, code_hash, code_prefix, label, issued_by)
        values (p_user_id, v_hash, substr(v_code, 1, 3), left(coalesce(p_label, ''), 80), 'service')
        returning id into v_id;
      exit;
    exception when unique_violation then
      v_id := null;
    end;
  end loop;

  if v_id is null then
    return jsonb_build_object('ok', false, 'code', 'generate_failed');
  end if;
  return jsonb_build_object('ok', true, 'id', v_id, 'raw', v_code);
end;
$$;

revoke all on function public.ai_service_issue_learning_code(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_service_issue_learning_code(uuid, text) to service_role;

/**
 * Friends Beta の受講権を1件作る（service_role 用）。
 * 既に同じ user_id の行があれば期間を上書きする（二重に増やさない）。
 */
create or replace function public.ai_service_grant_beta_access(p_user_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg jsonb;
  v_plan text;
  v_source text;
  v_days integer := greatest(1, least(coalesce(p_days, 30), 180));
  v_until timestamptz := now() + make_interval(days => greatest(1, least(coalesce(p_days, 30), 180)));
begin
  select value into v_cfg from public.ai_config where key = 'friends_beta';
  v_plan := coalesce(v_cfg->>'planId', 'friends-beta');
  v_source := coalesce(v_cfg->>'source', 'friends_beta');

  insert into public.ai_course_access (user_id, valid_from, valid_until, plan_id, source, note, granted_by)
  values (p_user_id, now(), v_until, v_plan, v_source, 'Friends Beta', 'friends_beta')
  on conflict (user_id) do update
    set valid_from = least(public.ai_course_access.valid_from, excluded.valid_from),
        valid_until = greatest(public.ai_course_access.valid_until, excluded.valid_until),
        plan_id = excluded.plan_id,
        source = excluded.source,
        updated_at = now();

  return jsonb_build_object('ok', true, 'validUntil', v_until, 'days', v_days, 'planId', v_plan);
end;
$$;

revoke all on function public.ai_service_grant_beta_access(uuid, integer) from public, anon, authenticated;
grant execute on function public.ai_service_grant_beta_access(uuid, integer) to service_role;

/** 呼び出し元が管理者かを service_role から確かめる（Edge Function 用） */
create or replace function public.ai_service_is_admin_email(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (select 1 from public.ai_admins a where lower(a.email) = lower(coalesce(p_email, '')))
$$;

revoke all on function public.ai_service_is_admin_email(text) from public, anon, authenticated;
grant execute on function public.ai_service_is_admin_email(text) to service_role;
