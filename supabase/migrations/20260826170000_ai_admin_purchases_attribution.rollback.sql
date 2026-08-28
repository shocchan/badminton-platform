-- 20260826170000 の取り消し。流入元の3列を返さない版へ戻す。
-- 表の列は落とさない（購入行は売上の記録で、画面の都合で消すものではない）。

drop function if exists public.ai_admin_list_purchases();

create function public.ai_admin_list_purchases()
returns table (
  id uuid, stripe_session_id text, plan_id text, plan_version int, amount_jpy int,
  livemode boolean, buyer_email text, locale text, status text, user_id uuid,
  login_id text, error text, created_at timestamptz, provisioned_at timestamptz,
  payment_method text, login_claimed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.stripe_session_id, p.plan_id, p.plan_version, p.amount_jpy,
         p.livemode, p.buyer_email, p.locale, p.status, p.user_id, p.login_id,
         p.error, p.created_at, p.provisioned_at, p.payment_method, p.login_claimed_at
  from public.ai_plan_purchases p
  where public.ai_is_admin()
  order by p.created_at desc
  limit 500;
$$;

revoke all on function public.ai_admin_list_purchases() from public, anon;
grant execute on function public.ai_admin_list_purchases() to authenticated;
