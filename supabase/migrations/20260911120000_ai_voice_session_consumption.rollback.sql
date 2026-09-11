-- ===================================================
-- ROLLBACK: 20260911120000_ai_voice_session_consumption.sql
--
-- 戻すと: 回数（週の枠・回数券）は、また「予約した瞬間」に減るようになる（2026-09-10 の動き）。
--
-- ⚠️ 戻すのは DB が先（または Edge Function と同時）。
--    DB をこの migration のままにして、Edge Function ai-lesson-token だけを台帳へ書かない古い版へ戻してはいけない
--    （トークンの記録が残らず、会話した回が「トークン無し＝消費しない」になる）。
--    新しい Edge Function は、この rollback のあとも動く（台帳の関数が無いと PGRST202 を受けて従来どおり発行する）。
--
-- 手順:
--   1. まだ決まっていない回を確定する（戻したあとは誰も確定しないため）。
--      「トークンが出ていないと確かに言える回」（台帳へ書く版が動き始めた後の予約で、閉じていて、トークン0）だけ消費しない。
--      それ以外（トークンが出た回・進行中の回・台帳へ書かない古い版が動いていた間の回）は消費する（回数券の回は1枚引く）。
--      9/10 の動きは「予約した時点で引く」なので、迷う回は引く側に倒す。
--   2. ai_start_session / ai_my_conversation_budget を 20260910100000 の本文へ戻す。
--      ただし数えるときに「台帳で消費しないと決まった回」は除く（戻した瞬間に、返した回が数え直されないように）。
--      残高は 0 未満を出さない。
--   3. この migration で足した関数を消し、「台帳へ書く版が動き始めた時刻」（ai_config.voice_claim_live_since）も消す
--      （残すと、あとで migration を入れ直したときに古い版の回がタダになる）。
--
-- 残すもの（わざと戻さない）:
--   - ai_voice_session_ledger テーブル: 2 の数え方で使う。本人は読めない・書けない
--   - ai_conversation_credits の (session_id) where reason='session' の一意索引: 旧本文も1回につき1行しか入れない
--   - ai_release_stale_sessions / ai_start_session の anon・PUBLIC からの revoke: 穴を開け直さない
-- ===================================================

-- ── 1. まだ決まっていない回を確定する ──
do $$
declare
  r record;
  v_live timestamptz := (select (value #>> '{}')::timestamptz from public.ai_config where key = 'voice_claim_live_since');
begin
  for r in
    select l.session_id, l.token_count, l.reserved_at, s.completion_status
      from public.ai_voice_session_ledger l
      left join public.ai_learning_sessions s on s.id = l.session_id
     where l.outcome = 'pending'
     order by l.reserved_at
     for update of l
  loop
    if r.token_count = 0
       and v_live is not null
       and r.reserved_at >= v_live
       and r.completion_status is distinct from 'in_progress' then
      update public.ai_voice_session_ledger
         set outcome = 'not_consumed', outcome_reason = 'rollback_no_token', settled_at = now()
       where session_id = r.session_id;
    else
      perform public.ai_voice_mark_consumed(r.session_id, 'rollback');
    end if;
  end loop;
end $$;

-- ── 2. 9/10 の本文へ戻す（数えるときに「消費しない」と決まった回だけ除く） ──
-- ── 5. セッション開始に週の上限と回数券を組み込む ──
CREATE OR REPLACE FUNCTION public.ai_start_session(p_mission_id text, p_lesson_kind text DEFAULT 'new'::text, p_mode text DEFAULT 'voice'::text, p_difficulty integer DEFAULT 2, p_target_expression text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_learner public.ai_learners%rowtype;
  v_access public.ai_course_access%rowtype;
  v_total_seconds bigint;
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
  -- プラン別の音声枠（2026-08-23 追加）
  v_mode text := coalesce(p_mode, 'voice');
  v_is_voice boolean := (coalesce(p_mode, 'voice') = 'voice');
  v_budgets jsonb;
  v_budget jsonb;
  v_voice_per_day int;
  v_voice_total int;
  v_text_per_day int;
  v_used_today int;
  v_used_total int;
  v_remaining_voice_total int := null;
  v_remaining_voice_today int := null;
  -- AI会話ベータ（2026-09-09 CEO指示）: 全員に週の上限をかけ、超えたぶんは回数券で使う
  v_beta jsonb;
  v_week_cap int;
  v_used_week int;
  v_credits int := 0;
  v_need_credit boolean := false;
  v_next_at timestamptz := null;
  v_session_seconds int;
begin
  select * into v_learner from public.ai_learners where user_id = auth.uid() limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_learner');
  end if;
  if not v_learner.is_active then
    return jsonb_build_object('ok', false, 'code', 'learner_suspended');
  end if;

  -- 受講権（利用期間・累計上限）のサーバー側チェック（2026-08-19 追加）。
  -- 行が無い learner と管理者は従来どおり通す（後方互換・段階導入）
  if not public.ai_is_admin() then
    select * into v_access from public.ai_course_access where user_id = auth.uid();
    if found then
      if now() < v_access.valid_from then
        return jsonb_build_object('ok', false, 'code', 'access_not_started');
      end if;
      if now() > v_access.valid_until then
        return jsonb_build_object('ok', false, 'code', 'access_expired');
      end if;
      -- AI体験パス等の累計上限（ai_seconds_limit・商品由来）。全期間の合計利用秒数で判定
      if v_access.ai_seconds_limit is not null then
        select coalesce(sum(seconds_used), 0) into v_total_seconds
          from public.ai_usage_daily where learner_id = v_learner.id;
        if v_total_seconds >= v_access.ai_seconds_limit then
          return jsonb_build_object('ok', false, 'code', 'plan_minutes_exhausted');
        end if;
      end if;

      -- ── プラン別の会話枠（2026-08-23）──
      -- plan_id が無い行（手動発行・既存の6か月生徒）は従来どおり共通上限のまま
      if v_access.plan_id is not null then
        select value into v_budgets from public.ai_config where key = 'plan_ai_budgets';
        v_budget := v_budgets -> v_access.plan_id;
        if v_budget is not null then
          v_voice_per_day := coalesce((v_budget->>'voiceSessionsPerDay')::int, 999);
          v_voice_total   := coalesce((v_budget->>'voiceSessionsTotal')::int, 999999);
          v_text_per_day  := coalesce((v_budget->>'textSessionsPerDay')::int, 999);

          -- 今日ぶん（JST）。mode ごとに数える＝テキストは音声の枠を減らさない
          select count(*) into v_used_today from public.ai_learning_sessions
            where learner_id = v_learner.id
              and mode = v_mode
              and (started_at at time zone 'Asia/Tokyo')::date = v_today
       and not exists (select 1 from public.ai_voice_session_ledger vl
                        where vl.session_id = ai_learning_sessions.id and vl.outcome = 'not_consumed');

          if v_is_voice then
            if v_used_today >= v_voice_per_day then
              return jsonb_build_object('ok', false, 'code', 'plan_voice_daily_limit',
                'voicePerDay', v_voice_per_day);
            end if;
            -- 受講期間ぜんぶの合計（この受講権が始まってから数える）
            select count(*) into v_used_total from public.ai_learning_sessions
              where learner_id = v_learner.id
                and mode = 'voice'
                and started_at >= v_access.valid_from
       and not exists (select 1 from public.ai_voice_session_ledger vl
                        where vl.session_id = ai_learning_sessions.id and vl.outcome = 'not_consumed');
            if v_used_total >= v_voice_total then
              return jsonb_build_object('ok', false, 'code', 'plan_voice_total_exhausted',
                'voiceTotal', v_voice_total);
            end if;
            v_remaining_voice_total := greatest(v_voice_total - (v_used_total + 1), 0);
            v_remaining_voice_today := greatest(v_voice_per_day - (v_used_today + 1), 0);
          else
            if v_used_today >= v_text_per_day then
              return jsonb_build_object('ok', false, 'code', 'plan_text_daily_limit',
                'textPerDay', v_text_per_day);
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;

  /*
   * ── AI会話は「週◯回まで」（2026-09-09 CEO指示・全員に適用）──────────────
   *
   * これまで音声の枠はプラン別にしか無く、**手動発行の生徒（plan_id が null）は
   * 共通上限の1日10回のまま**だった。1人で1日 最大¥1,000・月80回なら¥8,000で、
   * いちばん大きなコストの穴がここだった。プランの有無に関係なく週の上限をかける。
   *
   * 窓は**直近7日（ローリング）**。暦週にすると日曜に3回・月曜に3回と続けて
   * 燃やせてしまい、原価のピークを抑えられない。
   *
   * 上限を超えた人は、**回数券があればそれを1枚使って続けられる**。
   * ここでは判定だけして、実際に引くのはセッション行を作れたあと
   * （session_already_active 等で失敗した回に券を溶かさないため）。
   */
  if v_is_voice then
    select value into v_beta from public.ai_config where key = 'conversation_beta';
    v_week_cap := coalesce((v_beta->>'perWeek')::int, 3);

    select count(*) into v_used_week from public.ai_learning_sessions
      where learner_id = v_learner.id
        and mode = 'voice'
        and started_at >= now() - interval '7 days'
       and not exists (select 1 from public.ai_voice_session_ledger vl
                        where vl.session_id = ai_learning_sessions.id and vl.outcome = 'not_consumed');

    if v_used_week >= v_week_cap then
      select coalesce(sum(delta), 0) into v_credits
        from public.ai_conversation_credits where user_id = auth.uid();
      if v_credits <= 0 then
        -- いつ戻るかを必ず返す。「使えません」だけで終わらせない
        select min(started_at) + interval '7 days' into v_next_at
          from public.ai_learning_sessions
          where learner_id = v_learner.id and mode = 'voice'
            and started_at >= now() - interval '7 days'
       and not exists (select 1 from public.ai_voice_session_ledger vl
                        where vl.session_id = ai_learning_sessions.id and vl.outcome = 'not_consumed');
        return jsonb_build_object('ok', false, 'code', 'voice_weekly_limit',
          'perWeek', v_week_cap, 'usedThisWeek', v_used_week, 'nextAvailableAt', v_next_at,
          'credits', 0);
      end if;
      v_need_credit := true;
    end if;
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
    (v_learner.id, p_mission_id, v_mode, coalesce(p_lesson_kind, 'new'),
     coalesce(p_difficulty, 2), p_target_expression, 'in_progress')
  returning id into v_session_id;

  -- 予約時点で回数を消費する（ページ更新で回数だけ増える事故は
  -- session_already_active で弾かれるため発生しない）
  update public.ai_usage_daily
    set sessions_count = sessions_count + 1, updated_at = now()
    where learner_id = v_learner.id and usage_date = v_today;

  -- 週の上限を超えたぶんは回数券から1枚引く（セッションを作れた回だけ）
  if v_need_credit then
    insert into public.ai_conversation_credits (user_id, delta, reason, session_id)
      values (auth.uid(), -1, 'session', v_session_id);
    v_credits := v_credits - 1;
  end if;

  return jsonb_build_object(
    'ok', true,
    'sessionId', v_session_id,
    'learnerId', v_learner.id,
    'remainingSessions', v_max_sessions - (v_usage.sessions_count + 1),
    'remainingMonthly', greatest(v_monthly_max_sessions - (v_month_sessions + 1), 0),
    -- プラン別の音声枠の残り（プランが無ければ null＝画面は従来どおり出さない）
    'remainingVoiceTotal', v_remaining_voice_total,
    'remainingVoiceToday', v_remaining_voice_today,
    -- 週の残りと、券を使ったか（画面で正直に出すため）
    'remainingVoiceWeek', case when v_is_voice
      then greatest(coalesce(v_week_cap, 0) - (coalesce(v_used_week, 0) + 1), 0) else null end,
    'usedCredit', v_need_credit,
    'creditsRemaining', case when v_is_voice then v_credits else null end,
    -- 券で買った回は長く話せる（既定4分 / 券は6分）。秒数は画面には出さない
    'sessionMaxSeconds', case when v_is_voice then
      case when v_need_credit
        then coalesce((v_beta->>'paidSessionSeconds')::int, 360)
        else coalesce((v_beta->>'sessionSeconds')::int, 240) end
      else null end
  );
end;
$function$
;

-- ── 6. 画面に出す枠の情報（週の残り・回数券を含める） ──
--
-- これまで plan_id が無い人には hasBudget:false を返して**何も出していなかった**。
-- 週の上限は全員にかかるので、プランの有無に関係なく必ず返す。
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
  v_beta jsonb;
  v_week_cap int;
  v_used_week int;
  v_credits int;
  v_next_at timestamptz;
  v_voice_total int;
  v_voice_per_day int;
  v_text_per_day int;
  v_used_total int;
  v_used_voice_today int;
  v_used_text_today int;
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_plan jsonb := '{}'::jsonb;
begin
  select * into v_learner from public.ai_learners where user_id = auth.uid() limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_learner');
  end if;

  -- 週の枠は全員（プランの有無に関係なく）
  select value into v_beta from public.ai_config where key = 'conversation_beta';
  v_week_cap := coalesce((v_beta->>'perWeek')::int, 3);
  select count(*) into v_used_week from public.ai_learning_sessions
    where learner_id = v_learner.id and mode = 'voice'
      and started_at >= now() - interval '7 days'
       and not exists (select 1 from public.ai_voice_session_ledger vl
                        where vl.session_id = ai_learning_sessions.id and vl.outcome = 'not_consumed');
  select coalesce(sum(delta), 0)::int into v_credits
    from public.ai_conversation_credits where user_id = auth.uid();
  if v_used_week >= v_week_cap then
    select min(started_at) + interval '7 days' into v_next_at
      from public.ai_learning_sessions
      where learner_id = v_learner.id and mode = 'voice'
        and started_at >= now() - interval '7 days'
       and not exists (select 1 from public.ai_voice_session_ledger vl
                        where vl.session_id = ai_learning_sessions.id and vl.outcome = 'not_consumed');
  end if;

  -- プラン別の枠（持っている人だけ）
  select * into v_access from public.ai_course_access where user_id = auth.uid();
  if found and v_access.plan_id is not null then
    select value into v_budgets from public.ai_config where key = 'plan_ai_budgets';
    v_budget := v_budgets -> v_access.plan_id;
  end if;

  if v_budget is not null then
    v_voice_total   := coalesce((v_budget->>'voiceSessionsTotal')::int, 999999);
    v_voice_per_day := coalesce((v_budget->>'voiceSessionsPerDay')::int, 999);
    v_text_per_day  := coalesce((v_budget->>'textSessionsPerDay')::int, 999);

    select count(*) into v_used_total from public.ai_learning_sessions
     where learner_id = v_learner.id and mode = 'voice' and started_at >= v_access.valid_from
       and not exists (select 1 from public.ai_voice_session_ledger vl
                        where vl.session_id = ai_learning_sessions.id and vl.outcome = 'not_consumed');
    select count(*) into v_used_voice_today from public.ai_learning_sessions
     where learner_id = v_learner.id and mode = 'voice'
       and (started_at at time zone 'Asia/Tokyo')::date = v_today
       and not exists (select 1 from public.ai_voice_session_ledger vl
                        where vl.session_id = ai_learning_sessions.id and vl.outcome = 'not_consumed');
    select count(*) into v_used_text_today from public.ai_learning_sessions
     where learner_id = v_learner.id and mode = 'text'
       and (started_at at time zone 'Asia/Tokyo')::date = v_today
       and not exists (select 1 from public.ai_voice_session_ledger vl
                        where vl.session_id = ai_learning_sessions.id and vl.outcome = 'not_consumed');

    v_plan := jsonb_build_object(
      'planId', v_access.plan_id,
      'validUntil', v_access.valid_until,
      'voiceTotal', v_voice_total,
      'voiceRemainingTotal', greatest(v_voice_total - v_used_total, 0),
      'voicePerDay', v_voice_per_day,
      'voiceRemainingToday', greatest(v_voice_per_day - v_used_voice_today, 0),
      'textPerDay', v_text_per_day,
      'textRemainingToday', greatest(v_text_per_day - v_used_text_today, 0)
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    -- 週の枠は全員に出す（プランが無い人にも「あと何回」を見せる）
    'hasBudget', true,
    'voicePerWeek', v_week_cap,
    'voiceUsedThisWeek', v_used_week,
    'voiceRemainingWeek', greatest(v_week_cap - v_used_week, 0),
    'nextVoiceAvailableAt', v_next_at,
    'credits', greatest(v_credits, 0),
    'beta', true
  ) || v_plan;
end;
$$;

revoke all on function public.ai_my_conversation_budget() from public, anon;
grant execute on function public.ai_my_conversation_budget() to authenticated;

-- ── 3. この migration で足した関数と、動き始めた時刻の記録を消す ──
drop function if exists public.ai_voice_report_evidence(uuid, jsonb);
drop function if exists public.ai_service_claim_voice_token(uuid, uuid, boolean);
drop function if exists public.ai_service_release_voice_token(uuid, uuid);
drop function if exists public.ai_voice_settle_pending(uuid);
drop function if exists public.ai_voice_mark_consumed(uuid, text);
drop function if exists public.ai_voice_used_since(uuid, timestamptz, boolean);
drop function if exists public.ai_voice_oldest_used_since(uuid, timestamptz, boolean);
drop function if exists public.ai_voice_conversation_established(jsonb);
drop function if exists public.ai_voice_evidence_int(jsonb, text, bigint);
drop function if exists public.ai_voice_claim_live_since();
drop function if exists public.ai_voice_consumption_rule();

delete from public.ai_config where key = 'voice_claim_live_since';

notify pgrst, 'reload schema';
