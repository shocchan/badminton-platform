-- 20260910100000_ai_free_trial_invites.sql の巻き戻し。
--
-- 発行済みの受講権（source='invite'）は**消さない**。無料枠で学び始めた人を、
-- こちらの都合で締め出さないため。消したいときは個別に判断して消すこと。

drop trigger if exists ai_learners_provision_access on public.ai_learners;
drop function if exists public.ai_provision_access_from_grant();
drop function if exists public.ai_admin_issue_invite(text, text, text, integer, integer, timestamptz);

-- 招待の照合を、配る内容を写す前の形へ戻す
create or replace function public.ai_redeem_invite(p_code text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_invite public.ai_course_invites%rowtype;
  v_email text := lower(trim(p_email));
begin
  if v_email is null or v_email = '' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_email');
  end if;

  select * into v_invite from public.ai_course_invites
  where code = p_code and is_active limit 1;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'invalid_invite');
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'invite_expired');
  end if;
  if v_invite.max_uses is not null and v_invite.used_count >= v_invite.max_uses then
    return jsonb_build_object('ok', false, 'reason', 'invite_exhausted');
  end if;
  if v_invite.allowed_email is not null and lower(v_invite.allowed_email) <> v_email then
    return jsonb_build_object('ok', false, 'reason', 'invite_email_mismatch');
  end if;

  insert into public.ai_course_signup_grants (email, invite_id, expires_at, is_test)
  values (v_email, v_invite.id, now() + interval '24 hours', v_invite.is_test)
  on conflict (email) do update
    set invite_id = excluded.invite_id,
        granted_at = now(),
        expires_at = excluded.expires_at,
        consumed_at = null,
        is_test = excluded.is_test;

  return jsonb_build_object('ok', true, 'isTest', v_invite.is_test);
end;
$function$;

-- AI会話の枠から free-7d を外す（他3プランの値は変えない）
insert into public.ai_config (key, value)
values ('plan_ai_budgets', '{
  "ai-trial-pass": {"voiceSessionsTotal": 3,   "voiceSessionsPerDay": 2, "textSessionsPerDay": 4},
  "ai-month":      {"voiceSessionsTotal": 8,   "voiceSessionsPerDay": 2, "textSessionsPerDay": 8},
  "coach-6m":      {"voiceSessionsTotal": 180, "voiceSessionsPerDay": 3, "textSessionsPerDay": 8}
}'::jsonb)
on conflict (key) do update set value = excluded.value;

-- 列は残す（消すと、発行済みの招待が何を配る予定だったか分からなくなる）。
-- 完全に戻すなら手で:
--   alter table public.ai_course_invites drop column plan_id, drop column access_days, drop column channel;
--   alter table public.ai_course_signup_grants drop column plan_id, drop column access_days, drop column channel;
