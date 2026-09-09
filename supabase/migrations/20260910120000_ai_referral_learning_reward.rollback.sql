-- 20260910120000_ai_referral_learning_reward.sql の取り消し。
-- 「3日学習で報酬」をやめ、有料購入だけの元の形へ戻す。
--
-- 付与済みの受講権（延長された valid_until）は**戻さない**。
-- 既に本人へ「30日のびました」と見えているものを、こちらの都合で取り上げない。

drop trigger if exists ai_learners_referral_reward on public.ai_learners;
drop function if exists public.ai_learners_referral_reward();
drop function if exists public.ai_referral_reward_on_learning(uuid);
drop function if exists public.ai_referral_learning_days(uuid);

-- ai_referral_reward を 20260909130000 の本体へ戻す（共通部を使わない自己完結版）
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

drop function if exists public.ai_referral_apply_reward(uuid, text, uuid);

update public.ai_config set value = value - 'rewardMinLearningDays' where key = 'referral';

-- reward_reason 列は残す（付与済みの行がどちらで確定したかの記録を消さない）

comment on table public.ai_referrals is
  '紹介の記録。紹介しただけでは報酬なし。紹介された人の有料購入が確定して初めて rewarded になる';
