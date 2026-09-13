-- 無料招待（free-7d）に AI会話の「週3回の無料枠」を出さない（2026-09-13 CEO至急指示）
--
-- 症状: 週の無料枠は「全員」に付く設計（2026-09-09）だったため、7日間無料の人にも
--       「AI会話 あと3回」と表示され、実際に無料で使えていた。7日無料は AI会話を含まない商品
--       （招待ページ・メール・FAQ すべてでそう案内している）。使いたい人は回数券（有料）。
-- 対応: 週の枠の数を1か所（ai_voice_week_cap）で決め、対象外プランは 0 にする。
--       対象外プランは ai_config.conversation_beta.excludedPlans（既定 ["free-7d"]）で変えられる。
--       0 なら: 画面は「🔒 回数券で続ける」、開始RPCは voice_weekly_limit（回数券があればそれで続行）、
--       成立時の消費判定も回数券扱い。既存の有料・手動発行の生徒には変化なし。
-- 変更する関数: ai_start_session / ai_my_conversation_budget / ai_voice_mark_consumed
--   （本番の定義を取り出し、週の枠を読む1行だけ差し替えた。それ以外は1文字も変えていない）
-- rollback は同名の .rollback.sql（差し替え前の本番定義をそのまま戻す）

create or replace function public.ai_voice_week_cap(p_user_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_beta jsonb;
  v_plan text;
  v_excluded jsonb;
begin
  select value into v_beta from public.ai_config where key = 'conversation_beta';
  v_excluded := coalesce(v_beta -> 'excludedPlans', '["free-7d"]'::jsonb);
  select plan_id into v_plan from public.ai_course_access where user_id = p_user_id;
  if v_plan is not null and v_excluded ? v_plan then
    return 0;
  end if;
  return coalesce((v_beta ->> 'perWeek')::int, 3);
end;
$$;
revoke all on function public.ai_voice_week_cap(uuid) from public, anon, authenticated;

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
  v_today_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Tokyo')) at time zone 'Asia/Tokyo';
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

  -- 同じ人の開始を1つずつ処理する（2つのタブで同時に押しても、回数券を二重に使わない）
  perform pg_advisory_xact_lock(hashtextextended('ai_start_session:' || v_learner.id::text, 0));
  -- 放置された回を閉じ、会話が成立しなかった回を「消費しない」に確定してから数える（2026-09-11）
  perform public.ai_release_stale_sessions(v_learner.id);
  perform public.ai_voice_settle_pending(v_learner.id);

  -- 閉じずに離れた音声の回（台帳でまだ決まっていない回）があるときは、回数の上限より先に案内する（2026-09-11）。
  -- その回がトークンを取っていると上限の数に入り、「今週は使い切りました」になって
  -- 「前の回を終了して新しく始める」へたどり着けないため。
  -- テキストの回はこれまでどおり上限のあとで確かめる（始められない音声のためにテキストを終わらせない）
  if exists (
    select 1
      from public.ai_learning_sessions s
      join public.ai_voice_session_ledger l on l.session_id = s.id
     where s.learner_id = v_learner.id
       and s.completion_status = 'in_progress'
       and l.outcome = 'pending'
  ) then
    return jsonb_build_object('ok', false, 'code', 'session_already_active');
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

          -- 今日ぶん（JST）。mode ごとに数える＝テキストは音声の枠を減らさない。
          -- 音声は台帳で数える＝会話が成立しなかった回は数えない（2026-09-11）
          if v_is_voice then
            v_used_today := public.ai_voice_used_since(v_learner.id, v_today_start);
          else
            select count(*) into v_used_today from public.ai_learning_sessions
              where learner_id = v_learner.id
                and mode = v_mode
                and (started_at at time zone 'Asia/Tokyo')::date = v_today;
          end if;

          if v_is_voice then
            if v_used_today >= v_voice_per_day then
              return jsonb_build_object('ok', false, 'code', 'plan_voice_daily_limit',
                'voicePerDay', v_voice_per_day);
            end if;
            -- 受講期間ぜんぶの合計（この受講権が始まってから数える）
            v_used_total := public.ai_voice_used_since(v_learner.id, v_access.valid_from);
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
   * 窓は直近7日（ローリング）。上限を超えた人は、回数券があればそれを使って続けられる。
   *
   * 2026-09-11: 数えるのは「会話が成立した回（とトークンが出て進行中の回）」だけ。
   * 回数券は**ここでは引かない**。会話が成立した時点で ai_voice_mark_consumed が引く。
   */
  if v_is_voice then
    select value into v_beta from public.ai_config where key = 'conversation_beta';
    v_week_cap := public.ai_voice_week_cap(auth.uid()); -- 無料招待（free-7d）は 0（20260913130000）

    v_used_week := public.ai_voice_used_since(v_learner.id, now() - interval '7 days');

    if v_used_week >= v_week_cap then
      select coalesce(sum(delta), 0) into v_credits
        from public.ai_conversation_credits where user_id = auth.uid();
      if v_credits <= 0 then
        -- いつ戻るかを必ず返す。「使えません」だけで終わらせない
        v_next_at := public.ai_voice_oldest_used_since(v_learner.id, now() - interval '7 days')
          + interval '7 days';
        return jsonb_build_object('ok', false, 'code', 'voice_weekly_limit',
          'perWeek', v_week_cap, 'usedThisWeek', v_used_week, 'nextAvailableAt', v_next_at,
          'credits', 0);
      end if;
      v_need_credit := true;
    end if;
  end if;

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

  -- 日次の開始回数（スパイク防止の安全装置）は、従来どおり予約時に数える
  update public.ai_usage_daily
    set sessions_count = sessions_count + 1, updated_at = now()
    where learner_id = v_learner.id and usage_date = v_today;

  -- 音声の回は台帳に載せる。回数券の回でも、ここでは引かない（会話が成立したら引く）
  if v_is_voice then
    v_session_seconds := case when v_need_credit
      then coalesce((v_beta->>'paidSessionSeconds')::int, 360)
      else coalesce((v_beta->>'sessionSeconds')::int, 240) end;
    insert into public.ai_voice_session_ledger
      (session_id, learner_id, user_id, charge_kind, session_max_seconds)
    values
      (v_session_id, v_learner.id, auth.uid(),
       case when v_need_credit then 'credit' else 'free' end, v_session_seconds);
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
    -- 週の残りと、券を使う回か（画面で正直に出すため）
    'remainingVoiceWeek', case when v_is_voice
      then greatest(coalesce(v_week_cap, 0) - (coalesce(v_used_week, 0) + 1), 0) else null end,
    'usedCredit', v_need_credit,
    -- 会話が成立した場合の残り枚数（成立しなければ減らない）
    'creditsRemaining', case when v_is_voice
      then case when v_need_credit then v_credits - 1 else v_credits end else null end,
    'creditChargedOn', case when v_need_credit then 'conversation_established' else null end,
    -- 券で買った回は長く話せる（既定4分 / 券は6分）。秒数は画面には出さない
    'sessionMaxSeconds', case when v_is_voice then v_session_seconds else null end
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ai_my_conversation_budget()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_today_start timestamptz := (date_trunc('day', now() at time zone 'Asia/Tokyo')) at time zone 'Asia/Tokyo';
  v_plan jsonb := '{}'::jsonb;
begin
  select * into v_learner from public.ai_learners where user_id = auth.uid() limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_learner');
  end if;

  -- 終わった回の「消費する／しない」を先に確定する（ここで戻った回数が、そのまま画面に出る）
  perform public.ai_voice_settle_pending(v_learner.id);

  -- 週の枠は全員（プランの有無に関係なく）
  select value into v_beta from public.ai_config where key = 'conversation_beta';
  v_week_cap := public.ai_voice_week_cap(auth.uid()); -- 無料招待（free-7d）は 0（20260913130000）
  -- 画面に出す数は消費した回だけ（閉じずに離れた回で入口を塞がない）
  v_used_week := public.ai_voice_used_since(v_learner.id, now() - interval '7 days', false);
  select coalesce(sum(delta), 0)::int into v_credits
    from public.ai_conversation_credits where user_id = auth.uid();
  if v_used_week >= v_week_cap then
    v_next_at := public.ai_voice_oldest_used_since(v_learner.id, now() - interval '7 days', false)
      + interval '7 days';
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

    v_used_total := public.ai_voice_used_since(v_learner.id, v_access.valid_from, false);
    v_used_voice_today := public.ai_voice_used_since(v_learner.id, v_today_start, false);
    select count(*) into v_used_text_today from public.ai_learning_sessions
     where learner_id = v_learner.id and mode = 'text'
       and (started_at at time zone 'Asia/Tokyo')::date = v_today;

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
    'hasBudget', true,
    'voicePerWeek', v_week_cap,
    'voiceUsedThisWeek', v_used_week,
    'voiceRemainingWeek', greatest(v_week_cap - v_used_week, 0),
    'nextVoiceAvailableAt', v_next_at,
    -- 成立の報告が遅れて届いた回で一時的に負になっても、画面には 0 未満を出さない
    'credits', greatest(v_credits, 0),
    'beta', true
  ) || v_plan;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ai_voice_mark_consumed(p_session_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.ai_voice_session_ledger%rowtype;
  v_credit uuid;
  v_week_cap int;
  v_other int;
begin
  select * into v from public.ai_voice_session_ledger where session_id = p_session_id for update;
  if not found or v.outcome = 'consumed' then
    return;
  end if;

  -- 週の枠の回として予約した回でも、消費する時点で週の枠がもう埋まっていたら回数券の回にする。
  -- 前の回を「終了して新しく始める」で閉じたあとに、その回の成立の報告が遅れて届いた場合など。
  -- そうしないと、週の上限を超えて週の枠の回が増える（残高は負になりうる。画面は0未満を出さない）
  if v.charge_kind = 'free' then
    v_week_cap := public.ai_voice_week_cap(v.user_id); -- 無料招待（free-7d）は 0（20260913130000）
    select count(*) into v_other
      from public.ai_voice_session_ledger
     where learner_id = v.learner_id
       and session_id <> v.session_id
       and outcome = 'consumed'
       and reserved_at >= now() - interval '7 days';
    if v_other >= coalesce(v_week_cap, 3) then
      v.charge_kind := 'credit';
      update public.ai_voice_session_ledger set charge_kind = 'credit' where session_id = p_session_id;
    end if;
  end if;

  if v.charge_kind = 'credit' and v.credit_entry_id is null then
    insert into public.ai_conversation_credits (user_id, delta, reason, session_id, note)
      values (v.user_id, -1, 'session', v.session_id, 'voice:' || p_reason)
      on conflict (session_id) where reason = 'session' and session_id is not null do nothing
      returning id into v_credit;
  end if;

  update public.ai_voice_session_ledger
     set outcome = 'consumed',
         outcome_reason = p_reason,
         settled_at = now(),
         credit_entry_id = coalesce(credit_entry_id, v_credit)
   where session_id = p_session_id;
end;
$function$
;

notify pgrst, 'reload schema';
