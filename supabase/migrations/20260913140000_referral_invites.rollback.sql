-- 20260913140000_referral_invites.sql の取り消し。
-- 付与済みの +7日（valid_until）は戻さない（本人に見せた約束のため）。特典の記録も残す（perk='week' の行）。
drop trigger if exists ai_referral_invite_on_diagnosis on public.ai_learners;
drop function if exists public.ai_referral_invite_on_diagnosis();
drop function if exists public.ai_referral_invite_reward(uuid);
drop function if exists public.ai_my_referral_invite();
drop function if exists public.ai_invite_public_info(text);

-- 「始める」の権利: 20260912120000 の版に戻す（reward_kind を見ない）
create or replace function public.ai_invite_perks_on_trial_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer uuid;
begin
  if new.trial_started_at is null or old.trial_started_at is not null then return new; end if;
  if new.invite_code is null then return new; end if;
  select i.referrer_user_id into v_referrer
    from public.ai_course_invites i where i.code = new.invite_code;
  if v_referrer is null or v_referrer = new.user_id then return new; end if;
  insert into public.ai_invite_perks (referrer_user_id, invitee_user_id, invite_code)
  values (v_referrer, new.user_id, new.invite_code)
  on conflict (invitee_user_id) do nothing;
  return new;
exception when others then
  return new;
end;
$$;

-- week の行が残っていると CHECK を戻せないので、列は残す（reward_kind / perk='week' 行は無害）
delete from public.ai_config where key = 'referral_invite';
notify pgrst, 'reload schema';
