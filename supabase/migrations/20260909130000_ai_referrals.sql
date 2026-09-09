-- 紹介制度（2026-09-09 P1-5）
--
-- 【考え方】
-- 「よかった」と思った人が友達に渡せる形を作る。**紹介しただけでは報酬は出ない。**
-- 紹介された人が有料購入を終えて初めて、紹介した人の利用期間が30日伸びる。
-- 無料期間が永久に伸び続けないよう、最初は合計90日（＝3人ぶん）で止める。
--
-- 【口コミとは切り離す】
-- 感想を書くことを、割引・報酬・無料期間の条件にしない（PART E-6）。
-- この表は口コミの表（ai_testimonials）と一切つながっていない。
--
-- 【個人情報】
-- 紹介コードは本人に見せる公開値。invitee 側は user_id と anon_id しか持たない
-- （氏名・メールは持たない）。
--
-- rollback: 20260909130000_ai_referrals.rollback.sql

-- ── 1. 紹介コード（1人1つ） ──
create table if not exists public.ai_referral_codes (
  user_id uuid primary key,
  /** 本人に見せる公開のコード。8桁（紛らわしい文字を除く30文字集合） */
  code text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists ai_referral_codes_code_idx on public.ai_referral_codes (code);

alter table public.ai_referral_codes enable row level security;

drop policy if exists ai_referral_codes_own on public.ai_referral_codes;
create policy ai_referral_codes_own on public.ai_referral_codes
  for select to authenticated using (user_id = auth.uid() or public.ai_is_admin());

grant select on public.ai_referral_codes to authenticated;
grant all on public.ai_referral_codes to service_role;

-- ── 2. 紹介の記録 ──
create table if not exists public.ai_referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_user_id uuid not null,
  code text not null,
  /** 紹介リンクを開いたブラウザ。まだ誰か分からない段階のつなぎ */
  invitee_anon_id uuid,
  /** アカウントができたら入る。1人が二重に紹介されることはない */
  invitee_user_id uuid unique,
  /** どの購入で報酬が確定したか */
  purchase_id uuid,
  created_at timestamptz not null default now(),
  signed_up_at timestamptz,
  purchased_at timestamptz,
  /** pending=まだ / rewarded=付与済み / revoked=返金等で取り消し / capped=上限に達して付与せず */
  reward_status text not null default 'pending'
    check (reward_status in ('pending', 'rewarded', 'revoked', 'capped')),
  reward_days integer not null default 0,
  rewarded_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text
);

comment on table public.ai_referrals is
  '紹介の記録。紹介しただけでは報酬なし。紹介された人の有料購入が確定して初めて rewarded になる';

create index if not exists ai_referrals_inviter_idx on public.ai_referrals (inviter_user_id, created_at desc);
create index if not exists ai_referrals_anon_idx on public.ai_referrals (invitee_anon_id);
create index if not exists ai_referrals_purchase_idx on public.ai_referrals (purchase_id);

alter table public.ai_referrals enable row level security;

-- 紹介した本人は自分が紹介した行だけ見える（相手が誰かは返さない＝RPC側で件数だけ出す）
drop policy if exists ai_referrals_own on public.ai_referrals;
create policy ai_referrals_own on public.ai_referrals
  for select to authenticated using (inviter_user_id = auth.uid() or public.ai_is_admin());

grant select on public.ai_referrals to authenticated;
grant all on public.ai_referrals to service_role;

-- ── 3. 設定 ──
insert into public.ai_config (key, value)
values ('referral', jsonb_build_object(
  -- 紹介された人: 1か月AI自学プランの初月50%OFF。
  -- 実際の割引は Stripe の Coupon で行う。**couponId が空のあいだは割引を一切適用しない**
  -- （設定し忘れで「割引が効かない」より、「最初から出さない」ほうが誠実）
  'inviteeCouponId', '',
  'inviteeDiscountPercent', 50,
  'inviteeAppliesToPlan', 'ai-month',
  -- 紹介した人: 1件につき30日、合計90日まで
  'rewardDaysPerPurchase', 30,
  'rewardDaysCap', 90
))
on conflict (key) do nothing;

-- ── 4. 自分の紹介コード（無ければ作る） ──
create or replace function public.ai_my_referral()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_cfg jsonb;
  v_created int;
  v_purchased int;
  v_rewarded_days int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'not_signed_in');
  end if;

  select code into v_code from public.ai_referral_codes where user_id = v_uid;
  if v_code is null then
    -- 8桁。学習コードと同じ文字集合を使う（読み上げ・書き写しで間違えない）
    for i in 1..5 loop
      v_code := substr(public.ai_generate_learning_code(), 1, 8);
      begin
        insert into public.ai_referral_codes (user_id, code) values (v_uid, v_code);
        exit;
      exception when unique_violation then
        v_code := null;
      end;
    end loop;
    if v_code is null then
      return jsonb_build_object('ok', false, 'code', 'generate_failed');
    end if;
  end if;

  select value into v_cfg from public.ai_config where key = 'referral';

  select count(*) into v_created from public.ai_referrals where inviter_user_id = v_uid;
  select count(*) into v_purchased from public.ai_referrals
    where inviter_user_id = v_uid and reward_status = 'rewarded';
  select coalesce(sum(reward_days), 0) into v_rewarded_days from public.ai_referrals
    where inviter_user_id = v_uid and reward_status = 'rewarded';

  return jsonb_build_object(
    'ok', true,
    'code', v_code,
    'invited', v_created,
    'purchased', v_purchased,
    'rewardedDays', v_rewarded_days,
    'rewardDaysPerPurchase', coalesce((v_cfg->>'rewardDaysPerPurchase')::int, 30),
    'rewardDaysCap', coalesce((v_cfg->>'rewardDaysCap')::int, 90),
    'inviteeDiscountPercent', coalesce((v_cfg->>'inviteeDiscountPercent')::int, 50),
    -- 割引が実際に効くかどうか（Stripeのクーポンが設定済みか）。効かないなら約束しない
    'inviteeDiscountReady', coalesce(nullif(v_cfg->>'inviteeCouponId', ''), null) is not null
  );
end;
$$;

revoke all on function public.ai_my_referral() from public, anon;
grant execute on function public.ai_my_referral() to authenticated;

-- ── 5. 紹介リンクが開かれた（まだ誰か分からない段階） ──
/**
 * anon でも呼べる。**コードの持ち主が誰かは返さない**（総当たりで人を数えさせない）。
 * 同じブラウザ×同じコードは1行にまとめる。
 */
create or replace function public.ai_referral_touch(p_code text, p_anon_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inviter uuid;
begin
  if p_code is null or p_anon_id is null then
    return jsonb_build_object('ok', false);
  end if;
  select user_id into v_inviter from public.ai_referral_codes
   where code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g'));
  if v_inviter is null then
    return jsonb_build_object('ok', false);
  end if;

  insert into public.ai_referrals (inviter_user_id, code, invitee_anon_id)
  select v_inviter, upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')), p_anon_id
   where not exists (
     select 1 from public.ai_referrals r
      where r.invitee_anon_id = p_anon_id and r.inviter_user_id = v_inviter
   );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.ai_referral_touch(text, uuid) from public;
grant execute on function public.ai_referral_touch(text, uuid) to anon, authenticated, service_role;

-- ── 6. アカウントができた（signup） ──
create or replace function public.ai_referral_attach_user(p_anon_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  if p_anon_id is null or p_user_id is null then
    return jsonb_build_object('ok', false);
  end if;
  -- 自分で自分を紹介した形は残さない
  update public.ai_referrals
     set invitee_user_id = p_user_id, signed_up_at = coalesce(signed_up_at, now())
   where invitee_anon_id = p_anon_id
     and invitee_user_id is null
     and inviter_user_id <> p_user_id
     and not exists (select 1 from public.ai_referrals x where x.invitee_user_id = p_user_id);
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'attached', v_n);
end;
$$;

revoke all on function public.ai_referral_attach_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_referral_attach_user(uuid, uuid) to service_role;

-- ── 7. 報酬の付与（購入が確定したとき。webhook から呼ぶ） ──
/**
 * 紹介された人の有料購入が確定したら、紹介した人の利用期間を伸ばす。
 *
 * 守ること:
 *   - 1つの紹介につき1回だけ（二重付与しない）
 *   - 合計 rewardDaysCap（既定90日）を超えない。超えるぶんは 'capped' として記録し、付与しない
 *   - 期限切れの人にも効くように、伸ばす起点は max(now, valid_until)
 *   - 受講権の行が無い人には作る（Friends Beta と同じ枠で30日）
 */
create or replace function public.ai_referral_reward(p_invitee_user_id uuid, p_purchase_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref public.ai_referrals%rowtype;
  v_cfg jsonb;
  v_days int;
  v_cap int;
  v_already int;
  v_from timestamptz;
begin
  select * into v_ref from public.ai_referrals
   where invitee_user_id = p_invitee_user_id limit 1;
  if not found then
    return jsonb_build_object('ok', true, 'code', 'no_referral');
  end if;
  if v_ref.reward_status <> 'pending' then
    -- 既に付与済み・取り消し済み。Stripeの再送で二重に伸ばさない
    return jsonb_build_object('ok', true, 'code', 'already', 'status', v_ref.reward_status);
  end if;

  select value into v_cfg from public.ai_config where key = 'referral';
  v_days := coalesce((v_cfg->>'rewardDaysPerPurchase')::int, 30);
  v_cap  := coalesce((v_cfg->>'rewardDaysCap')::int, 90);

  select coalesce(sum(reward_days), 0) into v_already from public.ai_referrals
   where inviter_user_id = v_ref.inviter_user_id and reward_status = 'rewarded';

  if v_already + v_days > v_cap then
    update public.ai_referrals
       set reward_status = 'capped', purchase_id = p_purchase_id, purchased_at = now()
     where id = v_ref.id;
    return jsonb_build_object('ok', true, 'code', 'capped', 'already', v_already, 'cap', v_cap);
  end if;

  -- 期限切れでも効くように、伸ばす起点は「いま」と「現在の期限」の遅いほう
  select greatest(now(), valid_until) into v_from from public.ai_course_access
   where user_id = v_ref.inviter_user_id;

  if v_from is null then
    insert into public.ai_course_access (user_id, valid_from, valid_until, plan_id, source, note, granted_by)
    values (v_ref.inviter_user_id, now(), now() + make_interval(days => v_days),
            'friends-beta', 'referral_reward', '紹介のお礼', 'referral');
  else
    update public.ai_course_access
       set valid_until = v_from + make_interval(days => v_days), updated_at = now()
     where user_id = v_ref.inviter_user_id;
  end if;

  update public.ai_referrals
     set reward_status = 'rewarded', reward_days = v_days, rewarded_at = now(),
         purchase_id = p_purchase_id, purchased_at = now()
   where id = v_ref.id;

  return jsonb_build_object('ok', true, 'code', 'rewarded', 'days', v_days,
    'inviter', v_ref.inviter_user_id);
end;
$$;

revoke all on function public.ai_referral_reward(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_referral_reward(uuid, uuid) to service_role;

-- ── 8. 返金されたら取り消す ──
/**
 * 紹介された人の購入が返金されたら、伸ばした30日を戻す。
 * **いまより手前には戻さない**（返金の巻き添えで、いま学習中の人をその場で締め出さない）。
 */
create or replace function public.ai_referral_revoke_reward(p_purchase_id uuid, p_reason text default 'refund')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref public.ai_referrals%rowtype;
begin
  select * into v_ref from public.ai_referrals
   where purchase_id = p_purchase_id and reward_status = 'rewarded' limit 1;
  if not found then
    return jsonb_build_object('ok', true, 'code', 'nothing_to_revoke');
  end if;

  update public.ai_course_access
     set valid_until = greatest(now(), valid_until - make_interval(days => v_ref.reward_days)),
         updated_at = now()
   where user_id = v_ref.inviter_user_id;

  update public.ai_referrals
     set reward_status = 'revoked', revoked_at = now(),
         revoke_reason = left(coalesce(p_reason, 'refund'), 80)
   where id = v_ref.id;

  return jsonb_build_object('ok', true, 'code', 'revoked', 'days', v_ref.reward_days);
end;
$$;

revoke all on function public.ai_referral_revoke_reward(uuid, text) from public, anon, authenticated;
grant execute on function public.ai_referral_revoke_reward(uuid, text) to service_role;

-- ── 9. 管理画面用 ──
create or replace function public.ai_admin_referrals()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.ai_is_admin() then
    return jsonb_build_object('ok', false, 'code', 'forbidden');
  end if;
  return jsonb_build_object(
    'ok', true,
    'totals', jsonb_build_object(
      'codes', (select count(*) from public.ai_referral_codes),
      'clicked', (select count(*) from public.ai_referrals),
      'signedUp', (select count(*) from public.ai_referrals where signed_up_at is not null),
      'purchased', (select count(*) from public.ai_referrals where purchased_at is not null),
      'rewarded', (select count(*) from public.ai_referrals where reward_status = 'rewarded'),
      'rewardedDays', (select coalesce(sum(reward_days), 0) from public.ai_referrals where reward_status = 'rewarded'),
      'capped', (select count(*) from public.ai_referrals where reward_status = 'capped'),
      'revoked', (select count(*) from public.ai_referrals where reward_status = 'revoked')
    ),
    'discountReady', (
      select coalesce(nullif(value->>'inviteeCouponId', ''), null) is not null
        from public.ai_config where key = 'referral'
    )
  );
end;
$$;

revoke all on function public.ai_admin_referrals() from public, anon;
grant execute on function public.ai_admin_referrals() to authenticated;
