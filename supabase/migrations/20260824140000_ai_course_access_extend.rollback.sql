-- rollback: 20260824140000_ai_course_access_extend.sql
--
-- ⚠️ 戻すと Webhook（ai-course-stripe-webhook）が ai_grant_purchase_access を呼べなくなる。
--    **先に Edge Function を旧版へ戻すこと。** 順序を誤ると購入が provision できない。
--
-- ai_course_access の行は本migrationで一切変更していないため、戻す作業も不要。

drop function if exists public.ai_grant_purchase_access(uuid, uuid, text, int, int, int, int, text);
drop function if exists public.ai_plan_rank(text);

-- 反映済み購入の履歴。落とすと冪等性の記録が消えるので、
-- 本当に不要と判断したときだけ実行する（Webhook を旧版へ戻したあと）
drop table if exists public.ai_course_access_grants;

-- CHECK を元の4値へ戻す。
-- ⚠️ 'refunded' / 'awaiting_payment' の行が既にあると失敗する。
--    その場合は先に該当行の status を 'failed' などへ寄せてから実行すること。
do $$
declare r record;
begin
  for r in
    select con.conname
      from pg_constraint con
      join pg_class c on c.oid = con.conrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relname = 'ai_plan_purchases'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%provisioned%'
  loop
    execute format('alter table public.ai_plan_purchases drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.ai_plan_purchases
  add constraint ai_plan_purchases_status_check
  check (status in ('pending', 'paid', 'provisioned', 'failed'));
