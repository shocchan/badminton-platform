-- 20260826150000_ai_trial_seven_days.sql の取り消し。
--
-- ai_start_trial を実時間60分だけの版へ戻し、音声会話の1日配分を3へ戻す。
--
-- ⚠️ trial_days 列は**落とさない**。
-- 既に7日で開始した人の valid_until は書き換わっており、
-- 列を消しても期間は戻らない（戻すと逆に「なぜ7日あるのか」が読めなくなる）。
-- 新規に7日を配りたくないだけなら、列は残したまま
--   update public.ai_course_access set trial_days = null where trial_started_at is null;
-- で足りる（開始前の人だけ旧仕様に戻る）。

create or replace function public.ai_start_trial()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_course_access%rowtype;
  v_until timestamptz;
begin
  select * into v_row from public.ai_course_access where user_id = auth.uid();
  if not found then
    return jsonb_build_object('ok', false, 'code', 'no_access');
  end if;
  if v_row.trial_window_minutes is null then
    return jsonb_build_object('ok', false, 'code', 'not_trial_plan');
  end if;
  if v_row.trial_started_at is not null then
    return jsonb_build_object('ok', true, 'code', 'already_started',
      'startedAt', v_row.trial_started_at, 'validUntil', v_row.valid_until);
  end if;
  if now() > v_row.valid_until then
    return jsonb_build_object('ok', false, 'code', 'activation_expired');
  end if;
  if now() < v_row.valid_from then
    return jsonb_build_object('ok', false, 'code', 'not_started_yet');
  end if;

  v_until := now() + make_interval(mins => v_row.trial_window_minutes);
  update public.ai_course_access
    set trial_started_at = now(), valid_until = v_until, updated_at = now()
    where user_id = auth.uid();
  return jsonb_build_object('ok', true, 'code', 'started',
    'startedAt', now(), 'validUntil', v_until);
end;
$$;

revoke all on function public.ai_start_trial() from public, anon;
grant execute on function public.ai_start_trial() to authenticated;

update public.ai_config
  set value = jsonb_set(
        jsonb_set(value, '{ai-trial-pass,voiceSessionsPerDay}', '3'::jsonb),
        '{ai-trial-pass,textSessionsPerDay}', '10'::jsonb)
  where key = 'plan_ai_budgets' and value ? 'ai-trial-pass';
