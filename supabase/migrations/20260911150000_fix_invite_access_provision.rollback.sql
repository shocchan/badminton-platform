-- ROLLBACK: 20260911150000_fix_invite_access_provision.sql
-- 20260910100000 の本文へ戻す（戻すと、招待からの受講権の自動発行は再び動かなくなる）。
create or replace function public.ai_provision_access_from_grant()
returns trigger
language plpgsql
security definer
set search_path to public
as $$
declare
  v_email text;
  v_grant public.ai_course_signup_grants%rowtype;
  v_days  integer;
begin
  select lower(u.email) into v_email from auth.users u where u.id = new.user_id;
  if v_email is null then return new; end if;

  select * into v_grant from public.ai_course_signup_grants
   where email = v_email and consumed_at is null
   limit 1;
  if not found or v_grant.plan_id is null then return new; end if;

  -- 既に受講権がある人は対象外。**弱いものが強いものを上書きしない**
  if exists (select 1 from public.ai_course_access a where a.user_id = new.user_id) then
    update public.ai_course_signup_grants
       set consumed_at = now() where email = v_email;
    return new;
  end if;

  v_days := coalesce(v_grant.access_days, 7);
  insert into public.ai_course_access
    (user_id, valid_from, valid_until, plan_id, source, note, granted_by)
  values
    (new.user_id, now(), now() + make_interval(days => v_days),
     v_grant.plan_id, 'invite',
     coalesce('招待から自動発行 / ' || v_grant.channel, '招待から自動発行'),
     'ai_provision_access_from_grant');

  update public.ai_course_signup_grants
     set consumed_at = now() where email = v_email;
  return new;
exception when others then
  -- 受講権を作れなくても、学習者の登録そのものは通す（あとから手で付けられる）
  raise warning 'ai_provision_access_from_grant failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.ai_provision_access_from_grant() from public, anon, authenticated;
