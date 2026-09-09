-- rollback: 20260909100000_ai_payment_observability.sql
--
-- ⚠️ CHECK を元に戻すと 'awaiting_payment' / 'expired' の行が制約違反になるので、
--    先にその2つを 'pending' へ戻してから制約を張り直す（行は消さない）。

drop function if exists public.ai_expire_purchase(text);
drop function if exists public.ai_admin_payment_watch(integer);
drop table if exists public.ai_payment_events;

update public.ai_plan_purchases
   set status = 'pending'
 where status in ('awaiting_payment', 'expired');

alter table public.ai_plan_purchases
  drop constraint if exists ai_plan_purchases_status_check;
alter table public.ai_plan_purchases
  add constraint ai_plan_purchases_status_check
  check (status in ('pending', 'paid', 'provisioned', 'failed', 'refunded'));
