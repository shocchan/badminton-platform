-- プランごとのAI音声会話の枠をサーバー側で効かせる（CEO決定 2026-08-23）。
--
-- なぜ:
--   原価を持つのは音声会話だけ（gpt-realtime・本番実測 $8.11/時間）。
--   テキスト会話は約1/300、冒険・文法バトル・ミニ模試・答案・復習は原価ゼロ。
--   従来の上限は全プラン共通の「1日45分・月6時間」で、1か月プランが上限まで
--   使われると原価が売値を超えていた。音声だけをプラン別に絞り、それ以外は広く開ける。
--
-- 数字の正準は src/lib/aiLesson/course/plans/planAiBudget.ts。
-- ここ（ai_config.plan_ai_budgets）はその写しで、
-- scripts/ai-course/sync-plan-budgets.mjs が同期し、planAiBudget.test.ts がずれを検出する。
--
-- 後方互換:
--   - 管理者は従来どおり素通し
--   - ai_course_access が無い / plan_id が null の learner（手動発行・6か月コースの
--     既存生徒）は**従来の共通上限のまま**。黙って締め出さない
--   - 設定行が無いときも従来どおり動く（フェイルオープン）。締め出しの事故より、
--     原価が読める範囲で漏れるほうがまし

insert into public.ai_config (key, value)
values ('plan_ai_budgets', '{
  "ai-trial-pass": { "voiceSessionsTotal": 3,   "voiceSessionsPerDay": 3, "textSessionsPerDay": 10 },
  "ai-month":      { "voiceSessionsTotal": 10,  "voiceSessionsPerDay": 2, "textSessionsPerDay": 8 },
  "coach-6m":      { "voiceSessionsTotal": 180, "voiceSessionsPerDay": 3, "textSessionsPerDay": 8 }
}'::jsonb)
on conflict (key) do update set value = excluded.value;

create or replace function public.ai_start_session(
  p_mission_id text,
  p_lesson_kind text default 'new',
  p_mode text default 'voice',
  p_difficulty int default 2,
  p_target_expression text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
              and (started_at at time zone 'Asia/Tokyo')::date = v_today;

          if v_is_voice then
            if v_used_today >= v_voice_per_day then
              return jsonb_build_object('ok', false, 'code', 'plan_voice_daily_limit',
                'voicePerDay', v_voice_per_day);
            end if;
            -- 受講期間ぜんぶの合計（この受講権が始まってから数える）
            select count(*) into v_used_total from public.ai_learning_sessions
              where learner_id = v_learner.id
                and mode = 'voice'
                and started_at >= v_access.valid_from;
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

  return jsonb_build_object(
    'ok', true,
    'sessionId', v_session_id,
    'learnerId', v_learner.id,
    'remainingSessions', v_max_sessions - (v_usage.sessions_count + 1),
    'remainingMonthly', greatest(v_monthly_max_sessions - (v_month_sessions + 1), 0),
    -- プラン別の音声枠の残り（プランが無ければ null＝画面は従来どおり出さない）
    'remainingVoiceTotal', v_remaining_voice_total,
    'remainingVoiceToday', v_remaining_voice_today
  );
end;
$function$;
