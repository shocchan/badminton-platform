-- 紹介した生徒への特典（2026-09-12 CEO決定）
--
-- ■ 何をするか
--   生徒（例: エリさん）専用の招待コードから申し込んだ人が「7日間を始める」を押した瞬間、
--   紹介した生徒に特典を1つ選ぶ権利ができる。次にログインしたとき「紹介おめでとう」画面で
--   3つから選ぶ: オリジナルMV／システム利用1か月追加／日本語会話用の文法完全版。
--
-- ■ 仕組み
--   1. ai_course_invites.referrer_user_id … このコードは誰の紹介か（手で発行時に入れる）
--   2. ai_course_access.invite_code       … この受講権はどのコードから来たか（Edge Function が入れる）
--   3. ai_invite_perks                     … 特典の権利（申込者1人につき1件。選ぶまで perk は null）
--   4. trigger: trial_started_at が null→値 になった瞬間に 3 を作る（自分で自分を紹介した形は作らない）
--   5. ai_my_invite_perks()  … 本人が自分の権利を読む
--      ai_choose_invite_perk(id, perk) … 選ぶ。'month' は受講期限を +30日（その場で完了）。
--      'mv' / 'grammar' は選んだ記録だけ（渡すのは先生。管理画面で「渡した」を押す）
--      ai_admin_invite_perks() / ai_admin_fulfill_invite_perk(id) … 管理者用
--
-- ■ 守ること
--   - 既存の紹介制度（ai_referrals・有料購入の報酬）とは別の表。混ぜない
--   - 特典の権利は申込者1人につき1回だけ（invitee_user_id unique）
--   - 1か月追加は受講権がある人にだけ効く。期限切れなら「今から30日」
--   - 本人は select しかできない。書き込みは RPC だけ
-- rollback は同名の .rollback.sql

-- ── 1. 招待コードに紹介者を持たせる ─────────────────────────────────
alter table public.ai_course_invites
  add column if not exists referrer_user_id uuid references auth.users(id) on delete set null;
comment on column public.ai_course_invites.referrer_user_id is
  'このコードは誰（生徒）の紹介か。null＝先生が配るコード（朋友圈・小紅書など）';

-- ── 2. 受講権に「どのコードから来たか」を持たせる ──────────────────────
alter table public.ai_course_access
  add column if not exists invite_code text;
comment on column public.ai_course_access.invite_code is
  '招待から自動発行した受講権の元コード（ai-course-invite-signup が入れる）。null＝招待以外';

-- ── 3. 特典の権利 ────────────────────────────────────────────────
create table if not exists public.ai_invite_perks (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_user_id uuid not null unique references auth.users(id) on delete cascade,
  invite_code text not null,
  created_at timestamptz not null default now(),
  perk text check (perk in ('mv', 'month', 'grammar')),
  chosen_at timestamptz,
  fulfilled_at timestamptz,
  note text
);
comment on table public.ai_invite_perks is
  '紹介した生徒への特典（2026-09-12）。申込者が7日間を始めた瞬間に1件できる。perk は本人が選ぶ';
create index if not exists ai_invite_perks_referrer_idx on public.ai_invite_perks (referrer_user_id, created_at desc);

alter table public.ai_invite_perks enable row level security;
revoke all on public.ai_invite_perks from anon, authenticated;
grant select on public.ai_invite_perks to authenticated;
drop policy if exists ai_invite_perks_select on public.ai_invite_perks;
create policy ai_invite_perks_select on public.ai_invite_perks
  for select to authenticated using (referrer_user_id = auth.uid() or public.ai_is_admin());

-- ── 4. 「始める」を押した瞬間に権利を作る ─────────────────────────────
create or replace function public.ai_invite_perks_on_trial_start()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referrer uuid;
begin
  -- 未開始 → 開始 になった瞬間だけ。招待以外・再開始（冪等の update）は対象外
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
  -- 特典の記録で「始める」を止めない
  return new;
end;
$$;
revoke all on function public.ai_invite_perks_on_trial_start() from public, anon, authenticated;

drop trigger if exists ai_invite_perks_on_trial_start on public.ai_course_access;
create trigger ai_invite_perks_on_trial_start
  after update of trial_started_at on public.ai_course_access
  for each row execute function public.ai_invite_perks_on_trial_start();

-- ── 5. 本人が読む ─────────────────────────────────────────────────
create or replace function public.ai_my_invite_perks()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'inviteeName', coalesce(nullif(l.display_name, ''), null),
    'createdAt', p.created_at,
    'perk', p.perk,
    'chosenAt', p.chosen_at,
    'fulfilledAt', p.fulfilled_at
  ) order by p.created_at), '[]'::jsonb)
  from public.ai_invite_perks p
  left join public.ai_learners l on l.user_id = p.invitee_user_id
  where p.referrer_user_id = auth.uid();
$$;
revoke all on function public.ai_my_invite_perks() from public, anon;
grant execute on function public.ai_my_invite_perks() to authenticated;

-- ── 6. 本人が選ぶ ─────────────────────────────────────────────────
create or replace function public.ai_choose_invite_perk(p_id uuid, p_perk text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.ai_invite_perks%rowtype;
  v_until timestamptz;
begin
  if p_perk not in ('mv', 'month', 'grammar') then
    return jsonb_build_object('ok', false, 'code', 'invalid_perk');
  end if;
  select * into v_row from public.ai_invite_perks where id = p_id and referrer_user_id = auth.uid() for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  if v_row.perk is not null then
    return jsonb_build_object('ok', true, 'code', 'already_chosen', 'perk', v_row.perk);
  end if;

  if p_perk = 'month' then
    -- 受講期限を +30日。期限切れなら今から30日。受講権が無い人には付けられない
    update public.ai_course_access
      set valid_until = greatest(valid_until, now()) + interval '30 days', updated_at = now()
      where user_id = auth.uid()
      returning valid_until into v_until;
    if v_until is null then
      return jsonb_build_object('ok', false, 'code', 'no_access');
    end if;
    update public.ai_invite_perks
      set perk = p_perk, chosen_at = now(), fulfilled_at = now(), note = '受講期限 +30日（自動）'
      where id = p_id;
    return jsonb_build_object('ok', true, 'code', 'chosen', 'perk', p_perk, 'validUntil', v_until);
  end if;

  update public.ai_invite_perks set perk = p_perk, chosen_at = now() where id = p_id;
  return jsonb_build_object('ok', true, 'code', 'chosen', 'perk', p_perk);
end;
$$;
revoke all on function public.ai_choose_invite_perk(uuid, text) from public, anon;
grant execute on function public.ai_choose_invite_perk(uuid, text) to authenticated;

-- ── 7. 管理者 ─────────────────────────────────────────────────────
create or replace function public.ai_admin_invite_perks()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  return jsonb_build_object('ok', true, 'rows', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id,
      'referrerName', coalesce(nullif(lr.display_name, ''), ur.email),
      'referrerEmail', ur.email,
      'inviteeName', coalesce(nullif(li.display_name, ''), ui.email),
      'inviteeEmail', ui.email,
      'inviteCode', p.invite_code,
      'createdAt', p.created_at,
      'perk', p.perk,
      'chosenAt', p.chosen_at,
      'fulfilledAt', p.fulfilled_at,
      'note', p.note
    ) order by p.created_at desc), '[]'::jsonb)
    from public.ai_invite_perks p
    join auth.users ur on ur.id = p.referrer_user_id
    join auth.users ui on ui.id = p.invitee_user_id
    left join public.ai_learners lr on lr.user_id = p.referrer_user_id
    left join public.ai_learners li on li.user_id = p.invitee_user_id
  ));
end;
$$;
revoke all on function public.ai_admin_invite_perks() from public, anon;
grant execute on function public.ai_admin_invite_perks() to authenticated;

create or replace function public.ai_admin_fulfill_invite_perk(p_id uuid, p_done boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  update public.ai_invite_perks
    set fulfilled_at = case when p_done then coalesce(fulfilled_at, now()) else null end
    where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'not_found'); end if;
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.ai_admin_fulfill_invite_perk(uuid, boolean) from public, anon;
grant execute on function public.ai_admin_fulfill_invite_perk(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
