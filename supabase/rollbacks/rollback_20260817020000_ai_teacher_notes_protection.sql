-- 20260817020000_ai_teacher_notes_protection.sql の取り消し。
-- teacherNotes の保護だけを外し、答案用紙・帰化面接の保護は残した元の定義へ戻す。
create or replace function public.ai_save_learner_settings(p_settings jsonb)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  cur jsonb;
  merged jsonb := coalesce(p_settings, '{}'::jsonb);
begin
  select settings into cur from public.ai_learners where user_id = auth.uid() for update;
  if not found then
    return null;
  end if;
  merged := coalesce(cur, '{}'::jsonb) || merged;
  if jsonb_typeof(merged->'adventureV2') = 'object' and jsonb_typeof(cur->'adventureV2') = 'object' then
    if cur->'adventureV2' ? 'answerSheets' then
      merged := jsonb_set(merged, '{adventureV2,answerSheets}', cur->'adventureV2'->'answerSheets', true);
    end if;
    if cur->'adventureV2' ? 'interviewPrep' then
      if jsonb_typeof(merged->'adventureV2'->'interviewPrep') = 'object' then
        if cur->'adventureV2'->'interviewPrep' ? 'enabledAt' then
          merged := jsonb_set(merged, '{adventureV2,interviewPrep,enabledAt}',
            cur->'adventureV2'->'interviewPrep'->'enabledAt', true);
        end if;
      else
        merged := jsonb_set(merged, '{adventureV2,interviewPrep}', cur->'adventureV2'->'interviewPrep', true);
      end if;
    end if;
  end if;
  update public.ai_learners
    set settings = merged, updated_at = now()
    where user_id = auth.uid();
  return merged;
end
$function$;
