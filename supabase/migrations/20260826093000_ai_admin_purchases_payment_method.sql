-- 管理画面の購入台帳に決済手段を出せるようにする（2026-08-26）。
--
-- 20260826090000 で ai_plan_purchases.payment_method を足したが、
-- 管理画面は ai_admin_list_purchases() 経由でしか台帳を読まない（RLSではなくRPC）。
-- RPCの返り列に足さないと、画面からは永遠に見えない。
--
-- 戻り値の**列を増やす**ので CREATE OR REPLACE では変更できない（Postgresの制約）。
-- 先に DROP してから作り直す。権限も付け直す。
--
-- ロールバック: 20260826093000_..._payment_method.rollback.sql

drop function if exists public.ai_admin_list_purchases();

create function public.ai_admin_list_purchases()
returns table (
  id uuid,
  stripe_session_id text,
  plan_id text,
  plan_version integer,
  amount_jpy integer,
  livemode boolean,
  buyer_email text,
  locale text,
  status text,
  user_id uuid,
  login_id text,
  error text,
  created_at timestamptz,
  provisioned_at timestamptz,
  -- 追加: card / alipay / wechat_pay。未取得は null
  payment_method text,
  -- 追加: 購入直後の自動ログインを使ったか（Activationの効き目を見る）
  login_claimed_at timestamptz
)
language sql
security definer
set search_path to 'public'
as $function$
  select
    p.id, p.stripe_session_id, p.plan_id, p.plan_version, p.amount_jpy,
    p.livemode, p.buyer_email, p.locale, p.status, p.user_id, p.login_id,
    p.error, p.created_at, p.provisioned_at,
    p.payment_method, p.login_claimed_at
  from public.ai_plan_purchases p
  where public.ai_is_admin()
  order by p.created_at desc;
$function$;

revoke all on function public.ai_admin_list_purchases() from public;
grant execute on function public.ai_admin_list_purchases() to authenticated;
