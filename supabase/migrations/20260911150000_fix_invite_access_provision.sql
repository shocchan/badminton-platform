-- 招待からの受講権の自動発行が、実際には一度も動いていなかったのを直す（2026-09-11）。
--
-- ■ 何が起きていたか
--   ai_learners への INSERT で2つのトリガーが動く。
--     BEFORE: ai_learners_consume_grant  … 登録許可（signup_grants）を consumed_at = now() にする
--     AFTER : ai_learners_provision_access … 登録許可を **consumed_at is null で探して**受講権を作る
--   同じ INSERT の中で BEFORE が先に消費するので、AFTER は必ず「見つからない」で終わり、
--   招待（free-7d）から登録した人に受講権が付かなかった。
--
-- ■ 直し方
--   AFTER 側の検索を「その人のメールの登録許可で、plan_id があり、
--   まだ消費されていないか・たった今（同じ処理の中で）消費されたもの」にする。
--   それ以外の判定（既に受講権がある人には触らない・失敗しても登録は通す）は同じ。
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

  -- BEFORE トリガー（ai_learners_consume_grant）が同じ INSERT の中で消費済みにしているので、
  -- 「未消費」または「たった今消費された」ものを受け付ける
  select * into v_grant from public.ai_course_signup_grants
   where email = v_email
     and plan_id is not null
     and (consumed_at is null or consumed_at >= now() - interval '5 minutes')
   limit 1;
  if not found then return new; end if;

  -- 既に受講権がある人は対象外。**弱いものが強いものを上書きしない**
  if exists (select 1 from public.ai_course_access a where a.user_id = new.user_id) then
    update public.ai_course_signup_grants
       set consumed_at = coalesce(consumed_at, now()) where email = v_email;
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
     set consumed_at = coalesce(consumed_at, now()) where email = v_email;
  return new;
exception when others then
  -- 受講権を作れなくても、学習者の登録そのものは通す（あとから手で付けられる）
  raise warning 'ai_provision_access_from_grant failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.ai_provision_access_from_grant() from public, anon, authenticated;
