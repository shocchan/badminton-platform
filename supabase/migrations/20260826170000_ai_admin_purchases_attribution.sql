-- 購入台帳RPCに流入元を出す（2026-08-26 Phase S8）。
--
-- ai_plan_purchases に anon_id / attribution_source / attribution_campaign を
-- 20260826140000 で足したが、管理画面が読む ai_admin_list_purchases が
-- 旧いままで、**どこから来た人が買ったか**を画面に出せない。
--
-- Postgres は戻り値の列を増やすとき DROP が要る（CREATE OR REPLACE では変えられない）。
-- 参照している画面は無いので DROP → CREATE でよい。
--
-- rollback: 20260826170000_ai_admin_purchases_attribution.rollback.sql

drop function if exists public.ai_admin_list_purchases();

create function public.ai_admin_list_purchases()
returns table (
  id uuid,
  stripe_session_id text,
  plan_id text,
  plan_version int,
  amount_jpy int,
  livemode boolean,
  buyer_email text,
  locale text,
  status text,
  user_id uuid,
  login_id text,
  error text,
  created_at timestamptz,
  provisioned_at timestamptz,
  payment_method text,
  login_claimed_at timestamptz,
  anon_id text,
  attribution_source text,
  attribution_campaign text
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.stripe_session_id, p.plan_id, p.plan_version, p.amount_jpy,
         p.livemode, p.buyer_email, p.locale, p.status, p.user_id, p.login_id,
         p.error, p.created_at, p.provisioned_at, p.payment_method, p.login_claimed_at,
         p.anon_id, p.attribution_source, p.attribution_campaign
  from public.ai_plan_purchases p
  where public.ai_is_admin()
  order by p.created_at desc
  limit 500;
$$;

revoke all on function public.ai_admin_list_purchases() from public, anon;
grant execute on function public.ai_admin_list_purchases() to authenticated;
