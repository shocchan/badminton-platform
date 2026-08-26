-- 20260826093000 のロールバック（payment_method / login_claimed_at を返さない版へ戻す）
drop function if exists public.ai_admin_list_purchases();

create function public.ai_admin_list_purchases()
returns table (
  id uuid, stripe_session_id text, plan_id text, plan_version integer,
  amount_jpy integer, livemode boolean, buyer_email text, locale text,
  status text, user_id uuid, login_id text, error text,
  created_at timestamptz, provisioned_at timestamptz
)
language sql security definer set search_path to 'public'
as $function$
  select p.id, p.stripe_session_id, p.plan_id, p.plan_version, p.amount_jpy,
         p.livemode, p.buyer_email, p.locale, p.status, p.user_id, p.login_id,
         p.error, p.created_at, p.provisioned_at
  from public.ai_plan_purchases p
  where public.ai_is_admin()
  order by p.created_at desc;
$function$;

revoke all on function public.ai_admin_list_purchases() from public;
grant execute on function public.ai_admin_list_purchases() to authenticated;
