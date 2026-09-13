-- 生徒が自分の招待リンクで友達を無料招待すると、1人につき受講期限 +7日（2026-09-13 CEO決定）
--
-- ■ 何をするか
--   1. 招待コードに「紹介者への返し方」reward_kind を持たせる
--        choice … 紹介者が3つから選ぶ（エリさん用・20260912120000 の仕組み）
--        week   … 自動で受講期限 +7日（今回。上限は referral_invite.cap 人＝既定3人）
--   2. 生徒本人の招待コードを、学習画面から自動発行する（ai_my_referral_invite）
--   3. 紹介先が「7日間を始めて、1日目の診断を終えた」瞬間に紹介者へ +7日（trigger on ai_learners）
--        登録だけを条件にすると、同じ人が別メールで登録して自演できる（2026-09-13 に実例）
--   4. 招待ページが期限・満員をサーバーから読めるようにする（ai_invite_public_info）
--        本人用コードは締め切りが朋友圈の 9/19 とは別（既定 JLPT 当日）
--
-- ■ 守ること
--   - 既存のエリさん用コード（E69APBEW）は choice のまま。QATESTAE も choice
--   - 自分で自分を紹介した形では付かない。上限を超えた分は記録だけ残して延長しない
--   - 紹介先1人につき1回だけ（ai_invite_perks.invitee_user_id unique）
--   - 学習データ・受講権の他の列には触らない。延長は valid_until だけ
-- rollback は同名の .rollback.sql

-- ── 1. 招待コードの「返し方」 ─────────────────────────────────────
alter table public.ai_course_invites
  add column if not exists reward_kind text not null default 'choice'
  check (reward_kind in ('choice', 'week'));
comment on column public.ai_course_invites.reward_kind is
  '紹介者への返し方。choice=3つから選ぶ（先生が手で紐づけた生徒用）／week=自動で +7日（本人が学習画面から出す招待）';

-- 特典の種類に week を足す
alter table public.ai_invite_perks drop constraint if exists ai_invite_perks_perk_check;
alter table public.ai_invite_perks add constraint ai_invite_perks_perk_check
  check (perk in ('mv', 'month', 'grammar', 'week'));

-- 設定（上限人数・日数・本人用コードの期限と定員）
insert into public.ai_config (key, value)
values ('referral_invite', jsonb_build_object(
  'cap', 3, 'days', 7, 'maxUses', 100, 'expiresAt', '2026-12-06T14:59:59Z', 'planId', 'free-7d', 'accessDays', 7
))
on conflict (key) do nothing;

-- ── 2. 「始める」の瞬間の権利は choice だけ（week は診断完了で自動処理） ───
create or replace function public.ai_invite_perks_on_trial_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer uuid;
  v_kind text;
begin
  if new.trial_started_at is null or old.trial_started_at is not null then return new; end if;
  if new.invite_code is null then return new; end if;
  select i.referrer_user_id, i.reward_kind into v_referrer, v_kind
    from public.ai_course_invites i where i.code = new.invite_code;
  if v_referrer is null or v_referrer = new.user_id then return new; end if;
  if coalesce(v_kind, 'choice') <> 'choice' then return new; end if;
  insert into public.ai_invite_perks (referrer_user_id, invitee_user_id, invite_code)
  values (v_referrer, new.user_id, new.invite_code)
  on conflict (invitee_user_id) do nothing;
  return new;
exception when others then
  return new;
end;
$$;

-- ── 3. 診断完了で +7日 ──────────────────────────────────────────
create or replace function public.ai_referral_invite_reward(p_invitee uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg jsonb;
  v_cap int;
  v_days int;
  v_code text;
  v_referrer uuid;
  v_kind text;
  v_done int;
  v_inserted int;
  v_until timestamptz;
begin
  select value into v_cfg from public.ai_config where key = 'referral_invite';
  v_cap := coalesce((v_cfg ->> 'cap')::int, 3);
  v_days := coalesce((v_cfg ->> 'days')::int, 7);

  select a.invite_code into v_code from public.ai_course_access a where a.user_id = p_invitee;
  if v_code is null then return jsonb_build_object('ok', false, 'code', 'no_invite'); end if;
  select i.referrer_user_id, i.reward_kind into v_referrer, v_kind
    from public.ai_course_invites i where i.code = v_code;
  if v_referrer is null or v_kind <> 'week' then return jsonb_build_object('ok', false, 'code', 'not_week'); end if;
  if v_referrer = p_invitee then return jsonb_build_object('ok', false, 'code', 'self'); end if;

  -- 上限（延長済みの人数）。超えた分は「記録だけ」残す
  select count(*) into v_done from public.ai_invite_perks
    where referrer_user_id = v_referrer and perk = 'week' and fulfilled_at is not null;

  insert into public.ai_invite_perks (referrer_user_id, invitee_user_id, invite_code, perk, chosen_at, fulfilled_at, note)
  values (v_referrer, p_invitee, v_code, 'week', now(),
          case when v_done < v_cap then now() else null end,
          case when v_done < v_cap then format('紹介 +%s日（自動・%s人目）', v_days, v_done + 1) else format('上限（%s人）超え・延長なし', v_cap) end)
  on conflict (invitee_user_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('ok', true, 'code', 'already'); end if;
  if v_done >= v_cap then return jsonb_build_object('ok', true, 'code', 'capped'); end if;

  update public.ai_course_access
    set valid_until = greatest(valid_until, now()) + make_interval(days => v_days), updated_at = now()
    where user_id = v_referrer
    returning valid_until into v_until;
  return jsonb_build_object('ok', true, 'code', 'rewarded', 'validUntil', v_until, 'count', v_done + 1);
end;
$$;
revoke all on function public.ai_referral_invite_reward(uuid) from public, anon, authenticated;

create or replace function public.ai_referral_invite_on_diagnosis()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new text := new.settings #>> '{adventureV2,diagnosis,completedAt}';
  v_old text := old.settings #>> '{adventureV2,diagnosis,completedAt}';
begin
  if v_new is null or v_old is not null then return new; end if;
  perform public.ai_referral_invite_reward(new.user_id);
  return new;
exception when others then
  -- 紹介の処理で学習の保存を止めない
  return new;
end;
$$;
revoke all on function public.ai_referral_invite_on_diagnosis() from public, anon, authenticated;

drop trigger if exists ai_referral_invite_on_diagnosis on public.ai_learners;
create trigger ai_referral_invite_on_diagnosis
  after update of settings on public.ai_learners
  for each row execute function public.ai_referral_invite_on_diagnosis();

-- ── 4. 本人の招待コード（無ければ作る）と進み具合 ─────────────────────
create or replace function public.ai_my_referral_invite()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_learner public.ai_learners%rowtype;
  v_cfg jsonb;
  v_cap int;
  v_days int;
  v_code text;
  v_inv public.ai_course_invites%rowtype;
  v_rewarded int;
  v_waiting int;
  i int;
begin
  if v_uid is null then return jsonb_build_object('ok', false, 'code', 'unauthorized'); end if;
  select * into v_learner from public.ai_learners where user_id = v_uid;
  if not found then return jsonb_build_object('ok', false, 'code', 'no_learner'); end if;
  if not exists (select 1 from public.ai_course_access a where a.user_id = v_uid) then
    return jsonb_build_object('ok', false, 'code', 'no_access');
  end if;
  select value into v_cfg from public.ai_config where key = 'referral_invite';
  v_cap := coalesce((v_cfg ->> 'cap')::int, 3);
  v_days := coalesce((v_cfg ->> 'days')::int, 7);

  select * into v_inv from public.ai_course_invites
    where referrer_user_id = v_uid and reward_kind = 'week' and is_active
    order by created_at desc limit 1;
  if not found then
    -- 8文字（学習コードと同じ文字集合）。衝突したら作り直す
    for i in 1..20 loop
      v_code := (select string_agg(substr('23456789ABCDEFGHJKMNPQRSTVWXYZ', 1 + floor(random() * 30)::int, 1), '') from generate_series(1, 8));
      exit when not exists (select 1 from public.ai_course_invites where code = v_code);
    end loop;
    insert into public.ai_course_invites
      (code, label, max_uses, expires_at, is_active, is_test, plan_id, access_days, channel, referrer_user_id, reward_kind)
    values
      (v_code, format('紹介: %s', coalesce(nullif(v_learner.display_name, ''), v_uid::text)),
       coalesce((v_cfg ->> 'maxUses')::int, 100),
       coalesce((v_cfg ->> 'expiresAt')::timestamptz, '2026-12-06T14:59:59Z'),
       true, coalesce(v_learner.is_test, false),
       coalesce(v_cfg ->> 'planId', 'free-7d'), coalesce((v_cfg ->> 'accessDays')::int, 7),
       'student_referral', v_uid, 'week')
    returning * into v_inv;
  end if;

  select count(*) into v_rewarded from public.ai_invite_perks
    where referrer_user_id = v_uid and perk = 'week' and fulfilled_at is not null;
  -- 登録はしたが、まだ1日目の診断を終えていない人
  select count(*) into v_waiting from public.ai_course_access a
    where a.invite_code = v_inv.code and a.user_id <> v_uid
      and not exists (select 1 from public.ai_invite_perks p where p.invitee_user_id = a.user_id);

  return jsonb_build_object(
    'ok', true, 'code', v_inv.code, 'expiresAt', v_inv.expires_at,
    'rewarded', v_rewarded, 'cap', v_cap, 'days', v_days, 'waiting', v_waiting
  );
end;
$$;
revoke all on function public.ai_my_referral_invite() from public, anon;
grant execute on function public.ai_my_referral_invite() to authenticated;

-- ── 5. 招待ページ用の公開情報（期限・満員だけ。誰のコードかは出さない） ───────
create or replace function public.ai_invite_public_info(p_code text)
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select case when i.code is null then jsonb_build_object('ok', false)
    else jsonb_build_object(
      'ok', true,
      'active', i.is_active and (i.expires_at is null or i.expires_at > now()),
      'full', i.max_uses is not null and i.used_count >= i.max_uses,
      'expiresAt', i.expires_at
    ) end
  from (select 1) x
  left join public.ai_course_invites i on i.code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;
revoke all on function public.ai_invite_public_info(text) from public;
grant execute on function public.ai_invite_public_info(text) to anon, authenticated;

notify pgrst, 'reload schema';
