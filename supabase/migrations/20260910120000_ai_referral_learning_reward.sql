-- 紹介の報酬を「相手が3日学習したとき」に出す。2026-09-10 CEO決定。
--
-- ■ なぜ変えるか
--   これまでの発火条件は「紹介された人が有料購入したとき」だけだった。
--   確実だが**ほとんど発火しない**。紹介した人は報酬を一度も見ないまま忘れる。
--
--   かといって「登録した瞬間」にすると、捨てアドで無限に増やせる。原価はほぼ0でも
--   （原価を持つのはAI会話だけ）、**誰が本当に学んでいるのか分からなくなる**。
--   数字を作らない（PRODUCT_CANON 原則13）ためには、ここが汚れるのがいちばん困る。
--
--   「3日学習した」は、偽アカウントでやるには割に合わない。かつ
--   「本当に人を連れてきた」の定義として正しい。
--
-- ■ 1つの紹介につき報酬は1回だけ
--   ai_referrals は invitee 1人につき1行・reward_status も1つ。
--   3日学習と有料購入の**早いほうで**確定し、遅いほうは 'already' を返す。
--   どちらで確定したかは reward_reason に残す。
--
-- ■ 上限は据え置き
--   合計 rewardDaysCap（90日）を超えない。上限を残す理由はコストではなく、
--   「永久に無料な人は永久にお客さんにならない」から。
--
-- 追加中心。既存の表・関数の意味は変えない（ai_referral_reward は共通部を
-- 切り出すために置き換えるが、外から見た振る舞いは同じ）。
-- rollback: 20260910120000_ai_referral_learning_reward.rollback.sql

-- ── 1. どちらの条件で確定したかを残す ──────────────────────────────
alter table public.ai_referrals
  add column if not exists reward_reason text;

comment on column public.ai_referrals.reward_reason is
  'どの条件で報酬が確定したか。learning=紹介された人が既定日数を学習した / purchase=有料購入した';

-- ── 2. 何日学べば報酬か（設定） ────────────────────────────────────
-- 既存の referral 設定へキーを1つ足すだけ。他のキーは触らない
insert into public.ai_config (key, value)
values ('referral', jsonb_build_object('rewardMinLearningDays', 3))
on conflict (key) do update set value = ai_config.value || excluded.value;

-- ── 3. その人が何日学んだか ────────────────────────────────────────
/**
 * 学習日の単一の出所は settings.adventureV2.learningDays
 * （src/lib/aiLesson/course/adventure/advLearningDay.ts）。
 * **ログインしただけ・開いただけは入っていない。** ここで数え直さないのが要点で、
 * アプリ・メール・この報酬が同じ「学習した日」を見る。
 */
create or replace function public.ai_referral_learning_days(p_user_id uuid)
returns integer
language sql
stable
set search_path = public
as $$
  select coalesce(
    (select case
       when jsonb_typeof(l.settings->'adventureV2'->'learningDays') = 'array'
         then jsonb_array_length(l.settings->'adventureV2'->'learningDays')
       else 0
     end
       from public.ai_learners l where l.user_id = p_user_id limit 1),
    0);
$$;

-- ── 4. 報酬を実際に付ける（共通部） ────────────────────────────────
/**
 * 上限の判定と受講権の延長。**ここが唯一お金に触る場所**なので1か所に集める。
 *
 * 守ること:
 *   - 1つの紹介につき1回だけ（行をロックしてから状態を見る＝同時呼び出しで二重に付けない）
 *   - 合計 rewardDaysCap を超えない。超えるぶんは 'capped' として記録し、付与しない
 *   - 期限切れの人にも効くように、伸ばす起点は max(now, valid_until)
 */
create or replace function public.ai_referral_apply_reward(
  p_referral_id uuid,
  p_reason      text,
  p_purchase_id uuid default null
)
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
  -- ロックしてから状態を見る。webhook の再送と学習側のトリガーが同時に来ても二重に付かない
  select * into v_ref from public.ai_referrals where id = p_referral_id for update;
  if not found then
    return jsonb_build_object('ok', true, 'code', 'no_referral');
  end if;
  if v_ref.reward_status <> 'pending' then
    return jsonb_build_object('ok', true, 'code', 'already', 'status', v_ref.reward_status);
  end if;

  select value into v_cfg from public.ai_config where key = 'referral';
  v_days := coalesce((v_cfg->>'rewardDaysPerPurchase')::int, 30);
  v_cap  := coalesce((v_cfg->>'rewardDaysCap')::int, 90);

  select coalesce(sum(reward_days), 0) into v_already from public.ai_referrals
   where inviter_user_id = v_ref.inviter_user_id and reward_status = 'rewarded';

  if v_already + v_days > v_cap then
    update public.ai_referrals
       set reward_status = 'capped', reward_reason = p_reason,
           purchase_id = coalesce(p_purchase_id, purchase_id),
           purchased_at = case when p_purchase_id is null then purchased_at else now() end
     where id = v_ref.id;
    return jsonb_build_object('ok', true, 'code', 'capped', 'already', v_already, 'cap', v_cap);
  end if;

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
         reward_reason = p_reason,
         purchase_id = coalesce(p_purchase_id, purchase_id),
         purchased_at = case when p_purchase_id is null then purchased_at else now() end
   where id = v_ref.id;

  return jsonb_build_object('ok', true, 'code', 'rewarded', 'days', v_days,
    'reason', p_reason, 'inviter', v_ref.inviter_user_id);
end;
$$;

revoke all on function public.ai_referral_apply_reward(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.ai_referral_apply_reward(uuid, text, uuid) to service_role;

-- ── 5. 購入で確定する経路（既存）を共通部へ寄せる ──────────────────
-- 外から見た振る舞いは変えない。webhook の呼び出し方も変えない
create or replace function public.ai_referral_reward(p_invitee_user_id uuid, p_purchase_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.ai_referrals
   where invitee_user_id = p_invitee_user_id limit 1;
  if v_id is null then
    return jsonb_build_object('ok', true, 'code', 'no_referral');
  end if;
  return public.ai_referral_apply_reward(v_id, 'purchase', p_purchase_id);
end;
$$;

revoke all on function public.ai_referral_reward(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ai_referral_reward(uuid, uuid) to service_role;

-- ── 6. 学習で確定する経路（新規） ──────────────────────────────────
create or replace function public.ai_referral_reward_on_learning(p_invitee_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_min int;
  v_days int;
begin
  select id into v_id from public.ai_referrals
   where invitee_user_id = p_invitee_user_id and reward_status = 'pending' limit 1;
  if v_id is null then
    return jsonb_build_object('ok', true, 'code', 'no_pending_referral');
  end if;

  select coalesce((value->>'rewardMinLearningDays')::int, 3) into v_min
    from public.ai_config where key = 'referral';
  v_min := coalesce(v_min, 3);

  v_days := public.ai_referral_learning_days(p_invitee_user_id);
  if v_days < v_min then
    return jsonb_build_object('ok', true, 'code', 'not_yet', 'days', v_days, 'need', v_min);
  end if;

  return public.ai_referral_apply_reward(v_id, 'learning', null);
end;
$$;

revoke all on function public.ai_referral_reward_on_learning(uuid) from public, anon, authenticated;
grant execute on function public.ai_referral_reward_on_learning(uuid) to service_role;

-- ── 7. 学習が保存されたら見に行く ──────────────────────────────────
/**
 * なぜトリガーか: 「3日目に届く」からお礼として意味がある。日次のバッチだと最大1日遅れる。
 *
 * ホットパス（learner の保存は1日に何度も走る）なので、
 * **紹介の pending 行が無い人は索引1回で即座に抜ける**。
 * 紹介されていない人＝ほぼ全員は、実質なにもしない。
 *
 * 失敗しても学習の保存は絶対に止めない（例外を投げない）。
 */
create or replace function public.ai_learners_referral_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- invitee_user_id は unique 索引つき。ここで抜ける人が大多数
  if not exists (
    select 1 from public.ai_referrals
     where invitee_user_id = new.user_id and reward_status = 'pending'
  ) then
    return new;
  end if;

  perform public.ai_referral_reward_on_learning(new.user_id);
  return new;
exception when others then
  raise warning 'ai_learners_referral_reward failed: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.ai_learners_referral_reward() from public, anon, authenticated;

drop trigger if exists ai_learners_referral_reward on public.ai_learners;
create trigger ai_learners_referral_reward
  after update of settings on public.ai_learners
  for each row execute function public.ai_learners_referral_reward();

comment on table public.ai_referrals is
  '紹介の記録。紹介しただけでは報酬なし。紹介された人が3日学習するか有料購入して初めて rewarded になる';
