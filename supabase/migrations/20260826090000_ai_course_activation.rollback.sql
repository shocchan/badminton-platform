-- 20260826090000_ai_course_activation.sql のロールバック。
--
-- 注意: status CHECK を元に戻すと、既に 'refunded' の行があるときは失敗する。
-- その場合は先に該当行を確認すること（消さない・勝手に書き換えない）:
--   select id, status from public.ai_plan_purchases where status = 'refunded';

drop index if exists public.ai_plan_purchases_payment_method_idx;

alter table public.ai_plan_purchases drop column if exists payment_method;
alter table public.ai_plan_purchases drop column if exists login_claimed_at;

alter table public.ai_plan_purchases
  drop constraint if exists ai_plan_purchases_status_check;

alter table public.ai_plan_purchases
  add constraint ai_plan_purchases_status_check
  check (status in ('pending', 'paid', 'provisioned', 'failed'));
